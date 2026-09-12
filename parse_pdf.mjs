import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

const pdfBytes = fs.readFileSync('test.pdf');
const pdfDoc = await PDFDocument.load(pdfBytes);
const form = pdfDoc.getForm();
const fields = form.getFields();
fields.forEach(field => {
  const type = field.constructor.name
  const name = field.getName()
  console.log(`${type}: ${name}`)
})
