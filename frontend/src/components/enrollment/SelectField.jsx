export default function SelectField({ id, label, icon: Icon, error, required = false, options, placeholder, ...selectProps }) {
  const errorId = `${id}-error`;
  return (
    <div className={`enrollment-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}<span>{label}</span>
        {required ? <span aria-hidden="true">*</span> : null}
      </label>
      <select id={id} name={id} aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined} {...selectProps}>
        <option value="">{placeholder}</option>
        {options.map((option) => {
          const value = typeof option === 'string' ? option : option.value;
          const optionLabel = typeof option === 'string' ? option : option.label;
          return <option value={value} key={value}>{optionLabel}</option>;
        })}
      </select>
      {error ? <p className="enrollment-field-error" id={errorId}>{error}</p> : null}
    </div>
  );
}
