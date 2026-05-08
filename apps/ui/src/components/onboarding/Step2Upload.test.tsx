import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import Step2Upload from './Step2Upload';

const defaultProps = {
  onSubmit: vi.fn(),
  onBack: vi.fn(),
  isLoading: false,
  error: null,
};

function makeFile(name: string, type: string, sizeBytes: number): File {
  const content = new Array(sizeBytes).fill('a').join('');
  return new File([content], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Step2Upload', () => {
  test('shows AI notice about image processing', () => {
    render(<Step2Upload {...defaultProps} />);
    expect(screen.getByText(/inteligencia artificial/i)).toBeInTheDocument();
    expect(screen.getByText(/pueden requerir ajustes/i)).toBeInTheDocument();
  });

  test('shows "Continuar" primary button when no file selected', () => {
    render(<Step2Upload {...defaultProps} />);
    expect(screen.getByRole('button', { name: /^continuar/i })).toBeInTheDocument();
  });

  test('shows "Usar datos demo" secondary button always', () => {
    render(<Step2Upload {...defaultProps} />);
    expect(screen.getByRole('button', { name: /usar datos demo/i })).toBeInTheDocument();
  });

  test('shows "Volver" button', () => {
    render(<Step2Upload {...defaultProps} />);
    expect(screen.getByRole('button', { name: /volver/i })).toBeInTheDocument();
  });

  test('calls onBack when "Volver" is clicked', () => {
    const onBack = vi.fn();
    render(<Step2Upload {...defaultProps} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /volver/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  test('calls onSubmit(null, false) when "Continuar" clicked without file', () => {
    const onSubmit = vi.fn();
    render(<Step2Upload {...defaultProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /^continuar/i }));
    expect(onSubmit).toHaveBeenCalledWith(null, false);
  });

  test('calls onSubmit(null, true) when "Usar datos demo" clicked', () => {
    const onSubmit = vi.fn();
    render(<Step2Upload {...defaultProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /usar datos demo/i }));
    expect(onSubmit).toHaveBeenCalledWith(null, true);
  });

  test('shows error for invalid file type', () => {
    render(<Step2Upload {...defaultProps} />);
    const input = screen.getByTestId('photo-input');
    const file = makeFile('menu.gif', 'image/gif', 100);
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText(/solo se aceptan imágenes en formato JPG o PNG/i)).toBeInTheDocument();
  });

  test('shows error when file exceeds 5 MB', () => {
    render(<Step2Upload {...defaultProps} />);
    const input = screen.getByTestId('photo-input');
    const file = makeFile('menu.jpg', 'image/jpeg', 6 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText(/no puede superar 5 MB/i)).toBeInTheDocument();
  });

  test('shows "Procesar Menú" button when valid file selected', () => {
    render(<Step2Upload {...defaultProps} />);
    const input = screen.getByTestId('photo-input');
    const file = makeFile('menu.jpg', 'image/jpeg', 1000);
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole('button', { name: /procesar menú/i })).toBeInTheDocument();
  });

  test('shows file name in preview when valid file selected', () => {
    render(<Step2Upload {...defaultProps} />);
    const input = screen.getByTestId('photo-input');
    const file = makeFile('menu-foto.jpg', 'image/jpeg', 1000);
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('menu-foto.jpg')).toBeInTheDocument();
  });

  test('calls onSubmit(file, false) when "Procesar Menú" clicked', () => {
    const onSubmit = vi.fn();
    render(<Step2Upload {...defaultProps} onSubmit={onSubmit} />);
    const input = screen.getByTestId('photo-input');
    const file = makeFile('menu.jpg', 'image/jpeg', 1000);
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /procesar menú/i }));
    expect(onSubmit).toHaveBeenCalledWith(file, false);
  });

  test('removes file when remove button clicked', () => {
    render(<Step2Upload {...defaultProps} />);
    const input = screen.getByTestId('photo-input');
    fireEvent.change(input, { target: { files: [makeFile('menu.jpg', 'image/jpeg', 1000)] } });
    fireEvent.click(screen.getByRole('button', { name: /eliminar foto/i }));
    expect(screen.queryByText('menu.jpg')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^continuar/i })).toBeInTheDocument();
  });

  test('disables primary button and demo button when isLoading', () => {
    render(<Step2Upload {...defaultProps} isLoading={true} />);
    expect(screen.getByRole('button', { name: /^continuar/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /usar datos demo/i })).toBeDisabled();
  });

  test('shows API error message when error prop is set', () => {
    render(<Step2Upload {...defaultProps} error="Este correo ya está registrado" />);
    expect(screen.getByText('Este correo ya está registrado')).toBeInTheDocument();
  });
});
