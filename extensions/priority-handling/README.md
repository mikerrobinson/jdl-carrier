# Priority Handling Checkout Extension

A Shopify checkout UI extension that adds a "Priority Handling" checkbox to the shipping step.

## How It Works

1. Displays a checkbox before the shipping options in checkout
2. When checked, adds `_priority_handling: "true"` attribute to all cart line items
3. The carrier rate service detects this attribute and:
   - Adds $30 priority handling fee to all shipping rates
   - Adjusts delivery dates to reflect expedited fulfillment (ships within 1 business day)

## Installation

This extension must be part of a Shopify app. To deploy:

1. Ensure you have the Shopify CLI installed:
   ```bash
   npm install -g @shopify/cli @shopify/app
   ```

2. Connect to your Shopify app (from the extension directory):
   ```bash
   cd extensions/priority-handling
   npm install
   shopify app dev
   ```

3. Deploy to production:
   ```bash
   shopify app deploy
   ```

## Development

```bash
cd extensions/priority-handling
npm install
shopify app dev
```

This will start a development server and provide a preview URL for testing in checkout.

## Configuration

The extension targets `purchase.checkout.shipping-option-list.render-before`, which places the checkbox above the shipping method selection.

To change the placement, edit the `target` in `shopify.extension.toml`. Available targets:
- `purchase.checkout.shipping-option-list.render-before` (current)
- `purchase.checkout.shipping-option-list.render-after`
- `purchase.checkout.delivery-address.render-after`
