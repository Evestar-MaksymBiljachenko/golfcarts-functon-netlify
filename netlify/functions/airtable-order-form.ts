// netlify/functions/airtable-order-form.ts 
import { Handler, HandlerEvent } from "@netlify/functions";
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
 
const window = new JSDOM('').window;
const purify = DOMPurify(window);

const allowedFields = [
  "First", 
  "Email", 
  "Last",
  "Phone",
  "Delivery Address",
  "Delivery Zip Code",
  "Promo Code",
  "variant_id",
  "product_title"
];
export const handler: Handler = async (event: HandlerEvent) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(domain => `https://${domain.trim()}`)
    .filter(Boolean);
  const origin = event.headers.origin;

  const headers: { [key: string]: string } = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  if (event.httpMethod === "OPTIONS") { 
    return { statusCode: 204, headers };
   }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const fields: { [key: string]: any } = {};

    for (const fieldName of allowedFields) {
      if (body[fieldName] && typeof body[fieldName] === 'string') {
      
        fields[fieldName] = purify.sanitize(body[fieldName]);
      } else if (body[fieldName]) {
      
        fields[fieldName] = body[fieldName];
      }
    }

     if (Object.keys(fields).length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "No valid fields provided." }),
      };
    }

    const airtableFields = [
        "First", 
        "Email", 
        "Last",
        "Phone",
        "Delivery Address",
        "Delivery Zip Code",
        "Promo Code"
    ];
    const fieldsForAirtable = Object.fromEntries(
      Object.entries(fields).filter(([key]) => airtableFields.includes(key))
    );
    
     const response = await fetch("https://api.airtable.com/v0/apppoYoBsNzmQxZhU/tbloqTxr6RHhdeHYK", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [{ fields: fieldsForAirtable }] }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Airtable API error: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();

      // const { First, Email, variant_id, Phone } = fieldsForAirtable;

      // if (First && Email && variant_id && Phone) {}

        let line_items = [] as { variant_id: number; quantity: number }[];
        if (fields["variant_id"] && typeof fields["variant_id"] === 'string') {
          line_items = fields["variant_id"].split(',').map(id => ({
            variant_id: Number(id.trim()),
            quantity: 1,
          }));
        }

        const draftOrderData = {
          draft_order: {
            email: fields["Email"],
            line_items,
            shipping_address:{
              first_name: fields["First"],
              last_name: fields["Last"],
              address1: fields["Delivery Address"],
              phone: fields["Phone"],
              zip: fields["Delivery Zip Code"]
            },
            billing_address: {
              first_name: fields["First"],
              last_name: fields["Last"],
              address1: fields["Delivery Address"],
              phone: fields["Phone"],
              zip: fields["Delivery Zip Code"]
            },
            customer: {
              first_name: fields["First"],
              email: fields["Email"],
            },
            tags: "form-submission, netlify",
          },
        };

        const shopifyUrl = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/draft_orders.json`;

        try {
            const shopifyResponse = await fetch(shopifyUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Shopify-Access-Token": `${process.env.SHOPIFY_ADMIN_API_TOKEN}`,
                },
                body: JSON.stringify(draftOrderData),
            });

            if (!shopifyResponse.ok) {
                const errorData = await shopifyResponse.json();
                console.error(`Shopify API error: ${JSON.stringify(errorData)}`);
            }
        } catch (err) {
            console.error("Failed to create Shopify draft order:", err);
        }
      

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data),
      };


  } catch (err: any) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Something went wrong" }),
    };
  }
};
