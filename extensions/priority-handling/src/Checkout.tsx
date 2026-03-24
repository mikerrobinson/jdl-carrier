import {
  reactExtension,
  BlockStack,
  Checkbox,
  Text,
  useCartLines,
  useApplyCartLinesChange,
} from "@shopify/ui-extensions-react/checkout";
import { useState, useCallback } from "react";

export default reactExtension(
  "purchase.checkout.shipping-option-list.render-before",
  () => <PriorityHandlingCheckbox />,
);

function PriorityHandlingCheckbox() {
  const cartLines = useCartLines();
  const applyCartLinesChange = useApplyCartLinesChange();

  // Check if priority handling is currently enabled (check first line item)
  const initialChecked = cartLines.some(
    (line) => line.attributes?.find((attr) => attr.key === "_priority_handling")?.value === "true"
  );

  const [isChecked, setIsChecked] = useState(initialChecked);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleChange = useCallback(
    async (checked: boolean) => {
      setIsChecked(checked);
      setIsUpdating(true);

      try {
        // Update all line items with the priority handling attribute
        const updates = cartLines.map((line) => {
          const existingAttributes = line.attributes?.filter(
            (attr) => attr.key !== "_priority_handling"
          ) || [];

          const newAttributes = checked
            ? [...existingAttributes, { key: "_priority_handling", value: "true" }]
            : existingAttributes;

          return {
            type: "updateCartLine" as const,
            id: line.id,
            attributes: newAttributes,
          };
        });

        const result = await applyCartLinesChange(updates);

        if (result.type === "error") {
          console.error("Failed to update cart lines:", result.message);
          setIsChecked(!checked); // Revert on error
        }
      } catch (error) {
        console.error("Error updating priority handling:", error);
        setIsChecked(!checked); // Revert on error
      } finally {
        setIsUpdating(false);
      }
    },
    [cartLines, applyCartLinesChange]
  );

  return (
    <BlockStack spacing="tight">
      <Checkbox
        checked={isChecked}
        onChange={handleChange}
        disabled={isUpdating}
      >
        Priority Handling (+$30.00)
      </Checkbox>
      <Text size="small" appearance="subdued">
        Move your order to the front of the fulfillment queue — ships within 1 business day
      </Text>
    </BlockStack>
  );
}
