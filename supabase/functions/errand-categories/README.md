# Errand Categories API Endpoint

## Overview
Read-only backend API endpoint to fetch active errand categories from the `errand_categories` table.

## Endpoint
```
GET /api/errand-categories
```

## SQL Query
```sql
SELECT code, name 
FROM errand_categories 
WHERE is_active = true 
ORDER BY code;
```

## Response Format
```json
{
  "categories": [
    {
      "code": "DELIVERY",
      "name": "Deliver Items"
    },
    {
      "code": "FOOD",
      "name": "Food Delivery"
    },
    {
      "code": "PRINTING",
      "name": "Printing"
    },
    {
      "code": "SCHOOL",
      "name": "School Materials"
    }
  ]
}
```

## Deployment
This is a Supabase Edge Function. Deploy using:
```bash
supabase functions deploy errand-categories
```

## Environment Variables
The function uses the following environment variables (automatically provided by Supabase):
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key

## CORS
The endpoint includes CORS headers to allow cross-origin requests.
