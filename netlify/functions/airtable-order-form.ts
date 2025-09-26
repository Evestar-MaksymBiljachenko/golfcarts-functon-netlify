// netlify/functions/airtable-order-form.ts  
import { Handler, HandlerEvent } from "@netlify/functions";
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
 
// Initialize DOMPurify for server-side sanitization
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Define allowed fields from the client-side form for security
const allowedFields = [
  "First", 
  "Email", 
  "Last",
  "Phone",
  "Delivery Address",
  "Delivery Zip Code",
  "Promo Code",
  "variant_id",       // Used for Shopify Draft Order
  "product_title"     // Could be stored in Airtable, not directly in Shopify Draft Order API
];

export const handler: Handler = async (event: HandlerEvent) => {
  // Parse allowed origins from environment variable
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(domain => `https://${domain.trim()}`)
    .filter(Boolean);
  const origin = event.headers.origin;

  // Initialize CORS headers
  const headers: { [key: string]: string } = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Dynamically set Access-Control-Allow-Origin if the origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  // Handle OPTIONS preflight requests for CORS
  if (event.httpMethod === "OPTIONS") { 
    return { statusCode: 204, headers };
  }

  // Enforce POST method for actual data submission
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  // Block requests from unauthorized origins (if not preflight)
  if (!origin || !allowedOrigins.includes(origin)) {
    return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: "Forbidden origin" }),
    };
  }

  let airtableResponseData; // To store Airtable's response
  let shopifyDraftOrderId: number | null = null; // To store the created Draft Order ID

  try {
    // Parse the incoming request body
    const body = JSON.parse(event.body || '{}');
    const fields: { [key: string]: any } = {};

    // Sanitize and filter incoming fields based on allowedFields
    for (const fieldName of allowedFields) {
      if (body[fieldName] && typeof body[fieldName] === 'string') {
        fields[fieldName] = purify.sanitize(body[fieldName]);
      } else if (body[fieldName]) {
        fields[fieldName] = body[fieldName];
      }
    }

    // Check if any valid fields were provided after sanitization
    if (Object.keys(fields).length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "No valid fields provided." }),
      };
    }
    
    // --- START: Create Draft Order in Shopify ---
    let line_items = [] as { variant_id: number; quantity: number }[];
    if (fields["variant_id"] && typeof fields["variant_id"] === 'string') {
      line_items = fields["variant_id"].split(',').map(id => ({
        variant_id: Number(id.trim()),
        quantity: 1, // Default quantity to 1 for each variant_id
      }));
    }

    // Only attempt to create a Draft Order if there are line items
    if (line_items.length > 0) {
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
            billing_address: { // Assuming billing is same as shipping for simplicity
              first_name: fields["First"],
              last_name: fields["Last"],
              address1: fields["Delivery Address"],
              phone: fields["Phone"],
              zip: fields["Delivery Zip Code"]
            },
            customer: { // Create or update customer in Shopify
              first_name: fields["First"],
              email: fields["Email"],
              last_name: fields["Last"], // Include last name if available
              phone: fields["Phone"],     // Include phone if available
            },
            tags: "form-submission, netlify, custom-order",
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
                // Important: If Shopify fails, we might still want to log to Airtable if possible,
                // but the client should know the draft order failed.
                throw new Error(`Failed to create Shopify Draft Order: ${JSON.stringify(errorData)}`);
            } else {
                const shopifyData = await shopifyResponse.json();
                shopifyDraftOrderId = shopifyData.draft_order.id; // CAPTURE THE DRAFT ORDER ID HERE!
                console.log('Shopify Draft Order Created with ID:', shopifyDraftOrderId);
            }
        } catch (err) {
            console.error("Failed to create Shopify draft order (network/parsing error):", err);
            throw new Error(`Shopify Draft Order creation failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    } else {
        console.warn("No line items for Shopify Draft Order. Skipping creation.");
    }
    // --- END: Create Draft Order in Shopify ---


    // --- START: Push data to Airtable (including Draft Order ID) ---
    const airtableFieldsToInclude = [
        "First", 
        "Email", 
        "Last",
        "Phone",
        "Delivery Address",
        "Delivery Zip Code",
        "Promo Code",
        "Shopify Order ID"
    ];
    
    // Filter fields specifically for Airtable
    const fieldsForAirtable = Object.fromEntries(
      Object.entries(fields).filter(([key]) => airtableFieldsToInclude.includes(key))
    );

    // Add the Shopify Draft Order ID to the Airtable fields if it was created
    if (shopifyDraftOrderId !== null) {
      fieldsForAirtable["Shopify Order ID"] = shopifyDraftOrderId; // Ensure this column exists in Airtable
      // You might also want to add the invoice URL if available:
      // fieldsForAirtable["Shopify Invoice URL"] = shopifyData.draft_order.invoice_url;
    }
    
    const airtableApiUrl = "https://api.airtable.com/v0/apppoYoBsNzmQxZhU/tbloqTxr6RHhdeHYK";
    const airtableResponse = await fetch(airtableApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: [{ fields: fieldsForAirtable }] }),
    });

    if (!airtableResponse.ok) {
      const errorData = await airtableResponse.json();
      throw new Error(`Airtable API error: ${JSON.stringify(errorData)}`);
    }

    airtableResponseData = await airtableResponse.json(); // Store Airtable's response
    // --- END: Push data to Airtable ---
      
      // Return a success response with relevant IDs
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: "Form submitted successfully, Draft Order created and data saved to Airtable!",
          airtableResponse: airtableResponseData,
          shopifyDraftOrderId: shopifyDraftOrderId, 
        }),
      };

  } catch (err: any) {
    console.error("General error in function:", err);
    // Return a 500 status code if any critical error occurred
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Something went wrong", 
        details: err.message,
        shopifyDraftOrderId: shopifyDraftOrderId // Indicate if draft order was created before failure
      }),
    };
  }
};
