const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function render(st) {
  if (!st) return;
  $('#title').textContent = st.title;
  $('#steps').innerHTML = st.steps.map((s) => `<li class="${s.status}">${esc(s.prompt || s.id)}</li>`).join('');
  $('#finish').textContent = st.index >= st.total ? 'Save recording' : `Save recording (${st.index}/${st.total} done)`;
}
window.recorder.onUpdate(render);
window.recorder.state().then(render);
$('#skip').addEventListener('click', () => window.recorder.skip());
$('#back').addEventListener('click', () => window.recorder.back());
$('#finish').addEventListener('click', () => window.recorder.finish());
$('#cancel').addEventListener('click', () => window.recorder.cancel());
$('#reload').addEventListener('click', (e) => { e.preventDefault(); window.recorder.reload(); });
