import {parsePiTfex} from "./pi-tfex";

export async function readTfexPdf(file: File, password: string, salt: string) {
  if (!file.name.toLowerCase().endsWith(".pdf") || file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error("เลือกไฟล์ PDF ขนาดไม่เกิน 10 MB");
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?raw");
  // Keep the worker source intact: Vite dev import rewriting adds its window-only HMR client.
  const workerUrl = URL.createObjectURL(new Blob([worker.default], {type: "text/javascript"}));
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer()), password, useSystemFonts: true});
  try {
    const pdf = await task.promise;
    const lines: {y: number; items: {x: number; text: string}[]}[] = [];
    if (pdf.numPages > 2) throw new Error("รองรับใบยืนยัน Pi ไม่เกิน 2 หน้า");
    const pages:string[]=[];
    for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
      const page=await pdf.getPage(pageNumber);
      const content=await page.getTextContent();
      lines.length=0;
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = item.transform[5], x = item.transform[4];
        let line = lines.find(line => Math.abs(line.y - y) < 2);
        if (!line) { line = {y, items: []}; lines.push(line); }
        line.items.push({x, text: item.str});
      }
      pages.push(lines.sort((a,b) => b.y-a.y).map(l => l.items.sort((a,b) => a.x-b.x).map(i => i.text).join(" ")).join("\n"));
    }
    return await parsePiTfex(pages.join("\n"), salt);
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") throw new Error("PDF ต้องใช้รหัสผ่าน หรือรหัสผ่านไม่ถูกต้อง กรุณากรอกใหม่แล้วลองอีกครั้ง");
    if (error instanceof Error && /InvalidPDFException|UnknownErrorException/.test(error.name)) throw new Error("เปิด PDF ไม่ได้ ไฟล์อาจเสียหายหรือเป็นรูปแบบที่ยังไม่รองรับ");
    throw error;
  } finally { await task.destroy(); URL.revokeObjectURL(workerUrl); }
}
