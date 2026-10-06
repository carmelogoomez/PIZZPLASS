import { useEffect, useRef, useState } from 'react';
import municipalities from './data/municipalities.json';
import './budget-form.css';
import SocialIcon from './SocialIcon';

const provinces = Object.keys(municipalities).sort((a, b) => a.localeCompare(b, 'es'));
const localISODate = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');
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
  const [status, setStatus] = useState(() => new URLSearchParams(window.location.search).get('enviado') === '1' ? 'ok' : '');
  const fieldRef = useRef(null);
  const headingRef = useRef(null);
  const last = step === fields.length - 1;
  const field = fields[step];
  const minimumDate = localISODate();
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
    const dateIsPast = field.name === 'fecha' && input.value && input.value < minimumDate;
    input.setCustomValidity(dateIsPast
      ? 'Selecciona hoy o una fecha posterior.'
      : (input.value.trim() || last ? '' : 'Completa este campo para continuar.'));
    return input.reportValidity();
  }

  function validDate() {
    return Boolean(form.fecha) && form.fecha >= minimumDate;
  }

  function validLocation() {
    return municipalities[form.provincia]?.includes(form.localidad);
  }

  function submit(event) {
    if (!validate()) { event.preventDefault(); return; }
    if (!last) {
      event.preventDefault();
      setStep(current => current + 1);
      return;
    }
    if (!validDate()) { event.preventDefault(); setStep(4); return; }
    if (!validLocation()) { event.preventDefault(); setStep(5); return; }
    if (form._honey) event.preventDefault();
  }

  const common = {
    ref: fieldRef, id: 'budget-' + field.name, name: field.name, value: form[field.name],
    onChange: update, required: !last, 'aria-describedby': 'budget-help',
  };

  if (status === 'ok') return <div className="budget-form budget-success" role="status">
    <h2 ref={headingRef} tabIndex="-1">¡Solicitud recibida! 🍕</h2>
    <p>Leo y Juan Antonio te responderán muy pronto.</p>
    <button className="button button--primary" onClick={() => setStatus('')}>Preparar otro presupuesto</button>
  </div>;

  return <form className="budget-form budget-wizard" action="https://formsubmit.co/pizzplasspizzas@gmail.com" method="POST" onSubmit={submit}>
    {fields.filter(({ name }) => name !== field.name).map(({ name }) => <input key={name} type="hidden" name={name} value={form[name]} />)}
    <input type="hidden" name="_subject" value="Nueva solicitud de presupuesto — PizzPlass" />
    <input type="hidden" name="_template" value="table" />
    <input type="hidden" name="_captcha" value="true" />
    <input type="hidden" name="_next" value="https://pizzplass.es/contacto.html?enviado=1" />
    <input type="hidden" name="_url" value="https://pizzplass.es/contacto.html" />
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
          : <input {...common} type={field.type} placeholder={field.placeholder} autoComplete={field.autoComplete} {...(field.type === 'date' ? { min: minimumDate } : {})} {...(field.type === 'number' ? { min: 1, step: 1, inputMode: 'numeric' } : {})} />}
      <small id="budget-help">{last ? 'Opcional. Puedes contarnos los detalles que quieras.' : field.name === 'localidad' ? 'Localidades de ' + form.provincia + '. Elige el municipio donde se celebrará el evento.' : 'Este campo es necesario para preparar tu propuesta.'}</small>
    </div>
    <div className="budget-actions">
      {step > 0 && <button type="button" className="button budget-back" onClick={() => { setStep(current => current - 1); setStatus(''); }}>← Volver</button>}
      {!last ? <button type="submit" className="button button--primary budget-next">Siguiente →</button> : <div className="budget-final">
        <button type="submit" className="button button--primary">Solicitar presupuesto</button>
        <a className="button budget-whatsapp" href={budgetWhatsapp(form)} target="_blank" rel="noopener noreferrer" onClick={event => {
          if (!validate() || !validDate() || !validLocation() || form._honey) {
            event.preventDefault();
            if (!validDate()) setStep(4);
            else if (!validLocation()) setStep(5);
          }
        }}><SocialIcon platform="whatsapp" />Escribir por WhatsApp</a>
      </div>}
    </div>
    {status === 'error' && <p role="alert" className="form-message form-message--error">No hemos podido enviarla. Puedes reintentar o escribirnos por WhatsApp con estos mismos datos.</p>}
    <small className="privacy-note">Usaremos tus datos únicamente para responder a esta solicitud.</small>
    {last && <small className="budget-help">En WhatsApp tendrás el mensaje preparado para revisarlo y pulsar Enviar.</small>}
  </form>;
}
