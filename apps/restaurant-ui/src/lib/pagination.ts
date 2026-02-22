export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function renderPagination(
  container: HTMLElement,
  meta: PaginationMeta,
  currentPage: number,
  onPageChange: (page: number) => void,
): void {
  if (meta.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const btnBase = 'pag-btn px-3 py-1 rounded text-sm cursor-pointer border';
  const btnDefault = 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50';
  const btnActive = 'bg-indigo-600 text-white border-indigo-600';

  let html = '';

  if (currentPage > 1) {
    html += `<button data-page="${currentPage - 1}" class="${btnBase} ${btnDefault}">‹</button>`;
  }

  for (let i = 1; i <= meta.totalPages; i++) {
    const cls = i === currentPage ? btnActive : btnDefault;
    html += `<button data-page="${i}" class="${btnBase} ${cls}">${i}</button>`;
  }

  if (currentPage < meta.totalPages) {
    html += `<button data-page="${currentPage + 1}" class="${btnBase} ${btnDefault}">›</button>`;
  }

  container.innerHTML = html;

  container.querySelectorAll<HTMLElement>('.pag-btn').forEach(btn => {
    btn.addEventListener('click', () => onPageChange(Number(btn.dataset.page)));
  });
}

export function setTableLoading(tbody: HTMLElement, colspan: number): void {
  tbody.innerHTML = `<tr><td colspan="${colspan}" class="px-4 py-8 text-center text-slate-400">Cargando...</td></tr>`;
}

export function setTableEmpty(tbody: HTMLElement, colspan: number, message: string): void {
  tbody.innerHTML = `<tr><td colspan="${colspan}" class="px-4 py-8 text-center text-slate-400">${message}</td></tr>`;
}

export function setTableError(tbody: HTMLElement, colspan: number, message: string): void {
  tbody.innerHTML = `<tr><td colspan="${colspan}" class="px-4 py-8 text-center text-red-400">${message}</td></tr>`;
}
