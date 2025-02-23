import http.client
import json
import time  # Import the 'time' module
from flask import Flask, jsonify, render_template, request, Response, stream_with_context
from flask_cors import CORS
from math_utils import calculate_cash_flow
import logging

app = Flask(__name__)

RAPID_ZILLOW_API_KEY = "f80c5fa134mshba6a5c4f6f4166fp1f6630jsnbf61a645f841"

CORS(app, resources={r"/api/*": {"origins": "https://*.app.github.dev"}})  # Consider more restrictive CORS in production

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Store cached Zillow data and the URL it corresponds to
cached_zillow_data = None
cached_zillow_url = None

top_properties = None

def get_property_details(zpid):
    """Fetches property data from the Zillow RapidAPI, for a specific zpid."""
    try:
        conn = http.client.HTTPSConnection("zillow-com1.p.rapidapi.com")
        headers = {
            'x-rapidapi-key': RAPID_ZILLOW_API_KEY,
            'x-rapidapi-host': "zillow-com1.p.rapidapi.com"
        }

        # Add the page parameter to the API request URL
        api_url = f"/property?zpid={zpid}"
        conn.request("GET", api_url, headers=headers)
        res = conn.getresponse()
        data = res.read()

        if res.status == 200:
            return json.loads(data.decode("utf-8"))
        else:
            print(f"Error from Zillow API: {res.status} - {res.reason}")
            return None
    except Exception as e:
        print(f"An error occurred: {e}")
        return None

def search_property_by_uri(zillow_url, page=1):
    """Fetches property data from the Zillow RapidAPI, for a specific page."""
    try:
        conn = http.client.HTTPSConnection("zillow-com1.p.rapidapi.com")
        headers = {
            'x-rapidapi-key': RAPID_ZILLOW_API_KEY,
            'x-rapidapi-host': "zillow-com1.p.rapidapi.com"
        }
        encoded_url = zillow_url.replace(":", "%3A").replace("/", "%2F").replace("?", "%3F").replace("=", "%3D").replace(
            "&", "%26").replace("{", "%7B").replace("}", "%7D").replace('"', "%22")

        # Add the page parameter to the API request URL
        api_url = f"/searchByUrl?url={encoded_url}&page={page}"
        conn.request("GET", api_url, headers=headers)
        res = conn.getresponse()
        data = res.read()

        if res.status == 200:
            return json.loads(data.decode("utf-8"))
        else:
            print(f"Error from Zillow API: {res.status} - {res.reason}")
            return None
    except Exception as e:
        print(f"An error occurred: {e}")
        return None


@app.route('/api/properties')
def get_properties():
    zillow_url = request.args.get('zillow_url')
    if not zillow_url:
        return jsonify({'error': 'Missing zillow_url parameter'}), 400

    loan_details_json = request.args.get('loan_details')
    expense_rates_json = request.args.get('expense_rates')

    default_loan_details = {
      "down_payment_percentage": 0.20,
      "interest_rate": 0.065,
      "loan_term": 30
    }

    default_expense_rates = {
      "property_management_rate": 0.08,
      "vacancy_rate": 0.05,
      "maintenance_rate": 0.05,
      "insurance_rate": 0.005,
      "property_taxes_rate": 0.01
    }

    loan_details = default_loan_details
    if (loan_details_json is not None):
        try:
            loan_details = json.loads(loan_details_json)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid loan_details JSON format'}), 400

    expense_rates = default_expense_rates
    if (expense_rates_json is not None):
        try:
            expense_rates = json.loads(expense_rates_json)
        except json.JSONDecodeError:
             return jsonify({'error': 'Invalid expense_rates JSON format'}), 400


    def generate():
        global cached_zillow_data, cached_zillow_url
        all_properties = []
        if zillow_url != cached_zillow_url:
            page = 1
            total_pages = 1

            while page <= total_pages:
                logging.info(f"Fetching page {page} of property data...")
                zillow_data = search_property_by_uri(zillow_url, page)

                if not zillow_data:
                    yield 'data: {"error": "Failed to fetch data from Zillow API"}\n\n'
                    return

                total_pages = zillow_data.get('totalPages', 1)
                properties = zillow_data.get('props', [])
                if not properties:
                    if page == 1:
                        yield 'data: {"error": "No properties found"}\n\n'
                        return
                    else:
                        break  # Exit loop if no more properties, but we had some on previous pages.

                all_properties.extend(properties)
                cached_zillow_data = all_properties # Cache data
                cached_zillow_url = zillow_url
                page += 1

                # Yield the newly fetched properties immediately.
                for prop in properties:
                    processed_prop = process_property(prop, loan_details, expense_rates)
                    yield f'data: {json.dumps(processed_prop)}\n\n'  # Send as SSE data

        else:  # If zillow_url is the same as cached_zillow_url
            logging.info(f"Using cached data for URL: {zillow_url}")
            for prop in cached_zillow_data:
                processed_prop = process_property(prop, loan_details, expense_rates)
                yield f'data: {json.dumps(processed_prop)}\n\n'

        # After fetching *all* pages, process top properties.
        # Sort all_properties (in-place) to maintain correct order.
        all_properties.sort(key=lambda x: (x.get('cash_on_cash_return') is not None, x.get('cash_on_cash_return')), reverse=True)
        top_properties = all_properties[:10] # Get the top properties

        for rank, property in enumerate(top_properties, 1):
            property['rank'] = rank
            logging.info (f"Retrieving property details for {rank} : {property.get('zpid')}")
            zpid = property.get('zpid')
            if zpid:
                property_details = get_property_details(zpid)  # Fetch details
                if property_details:
                    property['details'] = property_details
                    # Find the matching property in all_properties and update it
                    for p in all_properties:
                        if p.get('zpid') == zpid:
                            p['rank'] = rank  # Assign the rank
                            p['details'] = property_details  # Add details.
                            yield f'data: {json.dumps(p)}\n\n' # Send updated data
                            break  # Stop searching once found
        yield 'data: {"end_of_stream": true}\n\n'  # Signal the end


    return Response(stream_with_context(generate()), mimetype='text/event-stream')


def process_property(prop, loan_details, expense_rates):
    """Processes a single property and calculates financial metrics."""
    prop['price'] = prop.get('price', 0)
    prop['rentZestimate'] = prop.get('rentZestimate', 0)
    rent = prop.get('rentZestimate')
    price = prop.get('price')

    if rent and price:
        prop['rent_to_price_ratio'] = (rent / price) * 12 * 100 if price != 0 else None
    else:
        prop['rent_to_price_ratio'] = None

    cash_flow_data = calculate_cash_flow(prop, loan_details, expense_rates)
    if cash_flow_data:
        prop['annual_cash_flow'] = cash_flow_data['annual_cash_flow']
        prop['cash_on_cash_return'] = cash_flow_data['cash_on_cash_return']
    else:
        prop['annual_cash_flow'] = None
        prop['cash_on_cash_return'] = None

    return prop


@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)