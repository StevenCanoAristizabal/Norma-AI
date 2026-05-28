import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

export async function generateWordDocument(content: string, fileName: string = 'Oficio_AEFCM.docx') {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `Ciudad de México, a ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`,
                italics: true,
              }),
            ],
            spacing: {
              after: 400,
            },
          }),
          ...content.split('\n').map(line => {
             if (line.trim() === '') return new Paragraph({ spacing: { after: 200 } });
             return new Paragraph({
               children: [
                 new TextRun({
                   text: line.trim(),
                   size: 24, // 12pt
                   font: "Arial"
                 }),
               ],
               alignment: AlignmentType.JUSTIFIED,
               spacing: {
                 after: 120,
                 line: 360, // 1.5 spacing
               },
             });
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "\n\n\n__________________________________\n",
                bold: true,
              }),
              new TextRun({
                text: "FIRMA DE LA AUTORIDAD COMPETENTE",
                bold: true,
                size: 20,
              }),
            ],
            spacing: {
              before: 800,
            }
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
}
