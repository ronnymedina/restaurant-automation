const errorMessages: Record<string, string> = {
  EMAIL_ALREADY_EXISTS: 'Este correo ya está registrado',
  ONBOARDING_FAILED: 'Error en el proceso de registro. Intenta nuevamente.',
  VALIDATION_ERROR: 'Los datos ingresados no son válidos.',
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos',
  ACCOUNT_INACTIVE: 'Tu cuenta no está activa. Revisa tu correo para activarla.',
  INVALID_REFRESH_TOKEN: 'Tu sesión ha expirado. Inicia sesión nuevamente.',
  INVALID_ACTIVATION_TOKEN: 'El enlace no es válido o ya fue utilizado.',
  RESTAURANT_CREATION_FAILED: 'No se pudo completar el registro del restaurante. Intenta nuevamente.',
  USER_CREATION_FAILED: 'No se pudo crear la cuenta. Intenta nuevamente.',
  DEFAULT_CATEGORY_CREATION_FAILED: 'Hubo un problema al completar el registro de tu restaurante. Intenta nuevamente.',
  ONBOARDING_CLOSED: 'El registro ya no está disponible en esta instalación.',
};

const DEFAULT_ERROR = 'Hubo un error inesperado. Intenta nuevamente.';

export function getErrorMessage(code: string): string {
  return errorMessages[code] || DEFAULT_ERROR;
}
