const ImageIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Фон */}
    <rect x="3" y="3" width="18" height="18" rx="4" fill="#B00020" />

    {/* Горы */}
    <path
      d="M6 16.5 L10.2 11.2 Q10.8 10.5 11.6 10.9 L13 11.7
         Q13.5 12.0 13.9 11.7 L15.9 10.2 Q16.6 9.7 17.1 10.2
         L18.5 11.8 L18.5 16.5 Z"
      fill="#FFFFFF"
    />

    {/* Смягчение вершин */}
    <path
      d="M10.2 11.2 Q11 10.3 11.8 10.6 Q12.3 10.8 12.6 11.1
         Q12.0 10.8 11.4 11.1 Q10.8 11.4 10.2 11.9 Z"
      fill="#B00020"
      opacity="0.7"
    />

    {/* Солнце */}
    <circle cx="8.1" cy="8.8" r="1" fill="#FFFFFF" opacity="0.9" />
  </svg>
);

export default ImageIcon;
