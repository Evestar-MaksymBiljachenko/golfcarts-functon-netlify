// netlify/functions/airtableWebhook.js
import fetch from "node-fetch";

export const handler = async (event) => {
  try {
  
    const body = JSON.parse(event.body);
    console.log("📥 Airtable data:", body);

    const recordId ='345456456';     
    const status = 'updated';          
    const draftOrderId = '1231568929047';   
    const lineItems = null;  
    const paid = false           

   
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
