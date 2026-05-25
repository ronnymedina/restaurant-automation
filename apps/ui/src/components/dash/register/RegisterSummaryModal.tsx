import Modal from '../../commons/Modal';
import ShiftSummaryView from '../../commons/ShiftSummaryView';
import type { CashShiftDto, ShiftSummary } from './api';

interface Props {
  open: boolean;
  session: CashShiftDto | null;
  summary: ShiftSummary;
  onClose: () => void;
}

export default function RegisterSummaryModal({ open, session, summary, onClose }: Props) {
  return (
    <Modal open={open} title="Resumen de Caja" onClose={onClose} size="2xl">
      <ShiftSummaryView session={session} summary={summary} />
    </Modal>
  );
}
