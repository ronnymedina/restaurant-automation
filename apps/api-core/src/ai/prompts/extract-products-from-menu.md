Analyze this restaurant menu image and extract all products you can identify.

For each product, provide the following information in JSON format:
- name: product name (required)
- description: product description if visible
- price: numeric price without currency symbols (e.g., 15.50)

## Important Rules

### Price Format
Prices displayed with a dot as thousands separator (e.g., "22.500") should be interpreted as whole numbers (22500), NOT as decimals. The dot in these cases represents thousands, not cents.
- "22.500" → 22500
- "19.500" → 19500
- "1.200" → 1200

### Products with Multiple Sizes/Variants
If a menu shows a product with multiple prices for different sizes or variants (e.g., "Grande" and "Chica"), create a SEPARATE product entry for EACH variant, appending the size/variant name to the product name.

Example menu format:
```
PIZZAS       GRANDE    CHICA
Muzzarella   $22.500   $19.500
```

This should produce:
```json
[
  {"name": "Muzzarella Grande", "price": 22500},
  {"name": "Muzzarella Chica", "price": 19500}
]
```

## Response Format
Respond ONLY with a valid JSON array, no additional text. Example:
[
  {"name": "Classic Burger", "description": "With cheese, lettuce and tomato", "price": 12500},
  {"name": "Coca Cola", "price": 3000}
]

If you cannot identify any products, respond with an empty array: []
