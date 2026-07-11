export interface KitchenTicket {
  orderNumber: number;
  createdAt: string;
  items: Array<{
    productName: string;
    quantity: number;
    notes?: string;
  }>;
}
