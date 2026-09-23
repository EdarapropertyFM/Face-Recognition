export default function FormField({ id, label, icon: Icon, error, required = false, className = '', ...inputProps }) {
  const errorId = `${id}-error`;
  return (
    <div className={`enrollment-field ${error ? 'has-error' : ''} ${className}`.trim()}>
      <label htmlFor={id}>
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}<span>{label}</span>
        {required ? <span aria-hidden="true">*</span> : null}
      </label>
      <input id={id} name={id} aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined} {...inputProps} />
      {error ? <p className="enrollment-field-error" id={errorId}>{error}</p> : null}
    </div>
  );
}
