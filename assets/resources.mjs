// Downloads use same-origin links; no workbook or network code runs here.
const EMPTY_TEMPLATE_HASHES = new Set([
 '7fb5a428d9d57879be47f53e04d0e21e433ef4da284c439b51cbf05414b8bb5e',
 '6929415e6014f4f180c11b2082f66cc1d6fa603009730223cde527c8a553ea08',
 '7bb2bd9107f509a4ae1a95dd26bb0f390af2644be1857a130e20c53e2000f0b6',
]);

export function validatePreparedMotor(incoming) {
 if (EMPTY_TEMPLATE_HASHES.has(incoming.fingerprint)) {
  throw new Error('Es una plantilla sin actualizar. En Back, abre Excel de escritorio, pulsa ACTUALIZAR TODO en la portada, guarda y vuelve a cargar.');
 }
}

export function initializeResources(doc = document) {
 const dialog = doc.getElementById('resourcesDialog');
 let opener;
 for (const button of doc.querySelectorAll('[data-open-resources]')) {
  button.addEventListener('click', () => {
   opener = button;
   if (!dialog.open) dialog.showModal();
  });
 }
 doc.getElementById('closeResourcesButton').addEventListener('click', () => dialog.close());
 dialog.addEventListener('close', () => {
  for (const input of dialog.querySelectorAll('[data-resource-check]')) input.checked = false;
  updateChecks();
  opener?.focus();
 });
 const updateChecks = () => {
  const inputs = [...dialog.querySelectorAll('[data-resource-check]')];
  doc.getElementById('resourceCheckStatus').textContent = `${inputs.filter(input => input.checked).length} de ${inputs.length} comprobaciones marcadas por ti`;
 };
 dialog.addEventListener('change', updateChecks);
 doc.getElementById('uploadPreparedButton').addEventListener('click', () => {
  const upload = doc.getElementById('uploadButton');
  if (upload.disabled) return;
  dialog.close();
  upload.click();
 });
}

if (typeof document !== 'undefined') initializeResources();
