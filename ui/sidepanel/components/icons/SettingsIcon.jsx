import React from 'react'

export function SettingsIcon({ size = 16, className, ...props }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 16 16" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path 
        fillRule="evenodd" 
        clipRule="evenodd" 
        d="M2 11.3893V4.60932L8 1.23438L14 4.60933L14 11.3891L8 14.7641L2 11.3893ZM5.66669 7.99935C5.66669 6.71068 6.71136 5.66602 8.00002 5.66602C9.28868 5.66602 10.3334 6.71068 10.3334 7.99935C10.3334 9.28801 9.28868 10.3327 8.00002 10.3327C6.71136 10.3327 5.66669 9.28801 5.66669 7.99935Z" 
        fill="currentColor"
      />
    </svg>
  )
}
