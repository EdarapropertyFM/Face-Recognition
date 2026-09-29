import { ArrowRight, FileSignature, Home, KeyRound } from 'lucide-react';

const OPTIONS = [
  {
    value: 'owner', icon: Home, title: 'I am the owner',
    text: 'You own the unit. You will attach your National ID card.',
  },
  {
    value: 'tenant', icon: KeyRound, title: 'I am a tenant',
    text: 'You rent the unit. You will attach your National ID card and your rental agreement.',
  },
];

/** First screen: owner or tenant decides which documents the form asks for. */
export default function ResidentTypeStep({ value, onChange, onContinue }) {
  return (
    <section className="enrollment-card" aria-labelledby="resident-type-title">
      <p className="enrollment-step-label">Before you start</p>
      <h1 id="resident-type-title">Are you the owner or a tenant?</h1>
      <p className="enrollment-subtitle">Choose how you live in the unit. You can change this later.</p>
      <div className="resident-type-options" role="radiogroup" aria-labelledby="resident-type-title">
        {OPTIONS.map(({ value: option, icon: Icon, title, text }) => (
          <button type="button" key={option} role="radio" aria-checked={value === option}
            className={`resident-type-option ${value === option ? 'selected' : ''}`}
            onClick={() => onChange(option)}>
            <span className="resident-type-icon"><Icon size={24} aria-hidden="true" /></span>
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
          </button>
        ))}
      </div>
      {value === 'tenant' && (
        <p className="resident-type-note"><FileSignature size={16} aria-hidden="true" /> Have a clear photo of your rental agreement ready.</p>
      )}
      <button className="enrollment-button" type="button" disabled={!value} onClick={onContinue}>
        Continue <ArrowRight size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
