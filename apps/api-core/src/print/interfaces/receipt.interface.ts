export interface Receipt {
  restaurantName: string;
  orderNumber: number;
  date: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    notes?: string;
  }>;
  totalAmount: number;
  paymentMethod: string;
  customerEmail?: string;
}
