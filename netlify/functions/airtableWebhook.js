// netlify/functions/airtableWebhook.js

export const handler = async (event) => {
  try {
    // 1. Отримуємо дані з Airtable webhook
    const body = JSON.parse(event.body);
    console.log("📥 Airtable data:", body);

    const recordId = body.recordId;     
    const status = body.status;          
    const draftOrderId = body.draftId;   
    const lineItems = body.lineItems;    
    const paid = body.paid;             

    // 2. Якщо це просто оновлення — оновлюємо Draft Order
    if (status === "updated") {
      await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2025-01/draft_orders/${draftOrderId}.json`, {
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
    }

    // 3. Якщо оплачено — завершуємо драфт
    if (paid === true) {
      await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}.myshopify.com/admin/api/2025-01/draft_orders/${draftOrderId}/complete.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
          "Content-Type": "application/json",
        },
      });
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
