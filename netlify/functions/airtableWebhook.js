// netlify/functions/airtableWebhook.js

export const handler = async (event) => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Request body is missing" }),
      };
    }

    const body = JSON.parse(event.body);
    console.log("📥 Airtable data:", body);

    const { status, draftOrderId, lineItems, paid } = body;

    if (!draftOrderId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "draftOrderId is required in the request body",
        }),
      };
    }

    if (status === "updated") {
      const shopifyUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2025-01/draft_orders/${draftOrderId}.json`;
      const response = await fetch(shopifyUrl, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft_order: {
            id: draftOrderId,
            line_items: lineItems,
            note: "Updated automatically from Airtable",
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Shopify API Error:", errorData);
        throw new Error(
          `Shopify API responded with status ${response.status}: ${JSON.stringify(errorData)}`
        );
      }
    }

    if (paid === true) {
      const completeUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2025-01/draft_orders/${draftOrderId}/complete.json`;
      const completeResponse = await fetch(completeUrl, {
        method: "PUT", // Corrected from POST to PUT as per Shopify docs
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
          "Content-Type": "application/json",
        },
      });

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json();
        console.error("❌ Shopify API Error (complete):", errorData);
        throw new Error(
          `Shopify API (complete) responded with status ${completeResponse.status}: ${JSON.stringify(errorData)}`
        );
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error("❌ Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
