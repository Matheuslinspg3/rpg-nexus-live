import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

const pdfBytes = fs.readFileSync('test.pdf');
const pdfDoc = await PDFDocument.load(pdfBytes);
const form = pdfDoc.getForm();
const fields = form.getFields();

const map = {}
fields.forEach(field => {
  const type = field.constructor.name
  const name = field.getName()
  let val = '';
  try {
      if (type === 'PDFTextField') val = field.getText();
      else if (type === 'PDFCheckBox') val = field.isChecked();
  } catch(e) {}
  map[name] = val
})

console.log(JSON.stringify(map, null, 2))
