import { useEffect, useRef, useState } from 'react';
import municipalities from './data/municipalities.json';
import './budget-form.css';

const provinces = Object.keys(municipalities).sort((a, b) => a.localeCompare(b, 'es'));
const emptyForm = { nombre: '', email: '', telefono: '', tipo: '', fecha: '', provincia: '', localidad: '', invitados: '', mensaje: '', _honey: '' };
const fields = [
  { name: 'nombre', label: 'Nombre y apellidos', type: 'text', placeholder: 'Tu nombre', autoComplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', placeholder: 'tu@email.com', autoComplete: 'email' },
  { name: 'telefono', label: 'Teléfono', type: 'tel', placeholder: 'Tu teléfono', autoComplete: 'tel' },
  { name: 'tipo', label: 'Tipo de evento', type: 'select' },
  { name: 'fecha', label: 'Fecha del evento', type: 'date' },
  { name: 'provincia', label: 'Provincia', type: 'select' },
  { name: 'localidad', label: 'Pueblo/Localidad', type: 'select' },
  { name: 'invitados', label: 'Invitados aproximados', type: 'number', placeholder: 'Ej. 80' },
  { name: 'mensaje', label: 'Cuéntanos algo más', type: 'textarea', placeholder: 'Lugar, horario, ideas o cualquier duda' },
];

export function budgetWhatsapp(form) {
  const lines = fields.filter(({ name }) => name !== 'mensaje' || form.mensaje.trim()).map(({ name, label }) => {
    const value = name === 'fecha' ? form.fecha.split('-').reverse().join('/') : form[name];
    return label + ': ' + value;
  });
  return 'https://wa.me/34675264967?text=' + encodeURIComponent('¡Hola PizzPlass! Quiero solicitar presupuesto para un evento.\n\n' + lines.join('\n'));
}

export default function BudgetForm({ eventTypes }) {
  const [form, setForm] = useState(emptyForm);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const fieldRef = useRef(null);
  const sendingRef = useRef(false);
  const headingRef = useRef(null);
  const last = step === fields.length - 1;
  const field = fields[step];
  const options = field.name === 'tipo' ? [...eventTypes, 'Otro tipo de evento']
    : field.name === 'provincia' ? provinces : (municipalities[form.provincia] || []);

  useEffect(() => {
    if (status === 'ok') headingRef.current?.focus({ preventScroll: true });
    else if (step > 0) fieldRef.current?.focus({ preventScroll: true });
  }, [step, status]);

  function update(event) {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value, ...(name === 'provincia' && value !== current.provincia ? { localidad: '' } : {}) }));
    setStatus('');
    event.target.setCustomValidity('');
  }

  function validate() {
    const input = fieldRef.current;
    if (!input) return false;
    input.setCustomValidity(input.value.trim() || last ? '' : 'Completa este campo para continuar.');
    return input.reportValidity();
  }

  function validLocation() {
    return municipalities[form.provincia]?.includes(form.localidad);
  }

  async function submit(event) {
    event.preventDefault();
    if (sendingRef.current || !validate()) return;
    if (!last) { setStep(current => current + 1); return; }
    if (!validLocation()) { setStep(5); return; }
    if (form._honey) return;
    sendingRef.current = true;
    setSending(true);
    setStatus('');
    try {
      const response = await fetch('https://formsubmit.co/ajax/pizzplasspizzas@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...form, _subject: 'Nueva solicitud de presupuesto — PizzPlass', _template: 'table', _captcha: 'false' }),
      });
      const result = await response.json();
      if (!response.ok || !(result.success === true || result.success === 'true')) throw new Error('Envío rechazado');
      setStatus('ok');
      setForm(emptyForm);
      setStep(0);
    } catch {
      setStatus('error');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const common = {
    ref: fieldRef, id: 'budget-' + field.name, name: field.name, value: form[field.name],
    onChange: update, required: !last, disabled: sending, 'aria-describedby': 'budget-help',
  };

  if (status === 'ok') return <div className="budget-form budget-success" role="status">
    <h2 ref={headingRef} tabIndex="-1">¡Solicitud recibida! 🍕</h2>
    <p>Leo y Juan Antonio te responderán muy pronto.</p>
    <button className="button button--primary" onClick={() => setStatus('')}>Preparar otro presupuesto</button>
  </div>;

  return <form className="budget-form budget-wizard" onSubmit={submit}>
    <div className="form-heading"><span>Presupuesto sin compromiso</span></div>
    <div className="budget-progress-label" aria-live="polite"><span>Paso {step + 1} de {fields.length}</span><span>{Math.round((step + 1) / fields.length * 100)} %</span></div>
    <progress className="budget-progress" value={step + 1} max={fields.length} aria-label="Progreso del formulario" />
    <label className="honey" aria-hidden="true">Deja este campo vacío<input name="_honey" value={form._honey} onChange={update} tabIndex="-1" autoComplete="off" /></label>
    <div className="budget-step form-grid" key={field.name}>
      <label htmlFor={common.id}>{field.label}{!last && ' *'}</label>
      {field.type === 'select'
        ? <select {...common}><option value="">Elige {field.name === 'localidad' ? 'tu localidad' : 'una opción'}</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select>
        : field.type === 'textarea'
          ? <textarea {...common} placeholder={field.placeholder} maxLength={2000} />
          : <input {...common} type={field.type} placeholder={field.placeholder} autoComplete={field.autoComplete} {...(field.type === 'number' ? { min: 1, step: 1, inputMode: 'numeric' } : {})} />}
      <small id="budget-help">{last ? 'Opcional. Puedes contarnos los detalles que quieras.' : field.name === 'localidad' ? 'Localidades de ' + form.provincia + '. Elige el municipio donde se celebrará el evento.' : 'Este campo es necesario para preparar tu propuesta.'}</small>
    </div>
    <div className="budget-actions">
      {step > 0 && <button type="button" className="button budget-back" disabled={sending} onClick={() => { setStep(current => current - 1); setStatus(''); }}>← Volver</button>}
      {!last ? <button type="submit" className="button button--primary budget-next">Siguiente →</button> : <div className="budget-final">
        <button type="submit" className="button button--primary" disabled={sending}>{sending ? 'Enviando…' : 'Solicitar presupuesto'}</button>
        <a className="button budget-whatsapp" href={budgetWhatsapp(form)} target="_blank" rel="noopener noreferrer" aria-disabled={sending} onClick={event => { if (sending || !validate() || !validLocation() || form._honey) event.preventDefault(); }}>Escribir por WhatsApp</a>
      </div>}
    </div>
    {status === 'error' && <p role="alert" className="form-message form-message--error">No hemos podido enviarla. Puedes reintentar o escribirnos por WhatsApp con estos mismos datos.</p>}
    <small className="privacy-note">Usaremos tus datos únicamente para responder a esta solicitud.</small>
    {last && <small className="budget-help">En WhatsApp tendrás el mensaje preparado para revisarlo y pulsar Enviar.</small>}
  </form>;
}
