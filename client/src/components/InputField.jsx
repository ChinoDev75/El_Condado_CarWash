import { useId } from "react";
import { inputStyle } from "../styles/formStyles";

export default function InputField({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  required = false,
  autoComplete,
  ...props
}) {
  const generatedId = useId();
  const id = `${name || "field"}-${generatedId}`;

  return (
    <div>
      <label
        htmlFor={id}
        style={{
          display: "block",
          color: "#a0aec0",
          fontSize: "0.85rem",
          fontWeight: 600,
          marginBottom: "8px",
          letterSpacing: "0.05em",
          textTransform: "uppercase"
        }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        min={min}
        required={required}
        autoComplete={autoComplete}
        {...props}
        style={inputStyle}
        onFocus={(e) => {
          e.target.style.borderColor = "#D4AF37";
          e.target.style.background = "rgba(212,175,55,0.05)";
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "rgba(255,255,255,0.1)";
          e.target.style.background = "rgba(0,0,0,0.2)";
        }}
      />
    </div>
  );
}
