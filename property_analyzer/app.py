import http.client
import json
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
import math

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "https://*.app.github.dev"}})

# Store cached Zillow data and the URL it corresponds to
cached_zillow_data = None
cached_zillow_url = None

def calculate_monthly_payment(principal, annual_interest_rate, loan_term_years):
    if principal <= 0 or annual_interest_rate <= 0 or loan_term_years <=0:
      return 0

    monthly_interest_rate = annual_interest_rate / 12
    number_of_payments = loan_term_years * 12
    payment = principal * (monthly_interest_rate * (1 + monthly_interest_rate)**number_of_payments) / ((1 + monthly_interest_rate)**number_of_payments - 1)
    return payment

def calculate_cash_flow(property_data, loan_details, expense_rates):
    if not all(key in property_data for key in ['price', 'rentZestimate']):
        return None
    if not all(key in loan_details for key in ['down_payment_percentage', 'interest_rate', 'loan_term']):
        return None
    if not all(key in expense_rates for key in ['property_management_rate', 'vacancy_rate', 'maintenance_rate', 'insurance_rate', 'property_taxes_rate']):
        return None

    annual_rent = property_data['rentZestimate'] * 12
    down_payment = property_data['price'] * loan_details['down_payment_percentage']
    loan_amount = property_data['price'] - down_payment
    monthly_mortgage = calculate_monthly_payment(loan_amount, loan_details['interest_rate'], loan_details['loan_term'])
    annual_mortgage = monthly_mortgage * 12
    annual_hoa = property_data.get('hoa', 0) * 12  # Handle missing HOA
    if annual_hoa is None:
      annual_hoa = 0
    annual_property_management = annual_rent * expense_rates['property_management_rate']
    annual_vacancy = annual_rent * expense_rates['vacancy_rate']
    annual_maintenance = annual_rent * expense_rates['maintenance_rate']
    annual_insurance = property_data['price'] * expense_rates['insurance_rate']
    annual_property_taxes = property_data['price'] * expense_rates['property_taxes_rate']
    total_annual_expenses = (annual_mortgage + annual_hoa + annual_property_management +
                             annual_vacancy + annual_maintenance + annual_insurance +
                             annual_property_taxes)
    annual_cash_flow = annual_rent - total_annual_expenses
    cash_investment = down_payment + property_data.get('closing_costs', 0)
    if(cash_investment == 0): return None
    cash_on_cash_return = (annual_cash_flow / cash_investment) * 100

    return {
        'annual_cash_flow': annual_cash_flow,
        'cash_on_cash_return': cash_on_cash_return
    }

def fetch_zillow_data(zillow_url, page=1):
    """Fetches property data from the Zillow RapidAPI, for a specific page."""
    try:
        conn = http.client.HTTPSConnection("zillow-com1.p.rapidapi.com")
        headers = {
            'x-rapidapi-key': "f80c5fa134mshba6a5c4f6f4166fp1f6630jsnbf61a645f841",  # Replace with YOUR API Key
            'x-rapidapi-host': "zillow-com1.p.rapidapi.com"
        }
        encoded_url =  zillow_url.replace(":", "%3A").replace("/", "%2F").replace("?", "%3F").replace("=", "%3D").replace("&", "%26").replace("{", "%7B").replace("}", "%7D").replace('"',"%22")

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
    global cached_zillow_data, cached_zillow_url  # Access the global variables

    zillow_url = request.args.get('zillow_url')
    if not zillow_url:
        return jsonify({'error': 'Missing zillow_url parameter'}), 400

    # Check if the URL has changed.  If so, fetch new data.
    if zillow_url != cached_zillow_url:
        all_properties = []
        page = 1
        total_pages = 1

        while page <= total_pages:
            zillow_data = fetch_zillow_data(zillow_url, page)
            if not zillow_data:
                return jsonify({'error': 'Failed to fetch data from Zillow API'}), 500

            total_pages = zillow_data.get('totalPages', 1)
            properties = zillow_data.get('props', [])
            if not properties:
                if page == 1:
                    return jsonify({'error': 'No properties found in Zillow response'}), 404
                else:
                    break;
            all_properties.extend(properties)
            page += 1

        cached_zillow_data = all_properties  # Cache the fetched data
        cached_zillow_url = zillow_url      # Cache the URL
    else:
        # Use cached data if the URL is the same
        all_properties = cached_zillow_data


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
    if(loan_details_json is not None):
        loan_details = json.loads(loan_details_json)

    expense_rates = default_expense_rates
    if(expense_rates_json is not None):
      expense_rates = json.loads(expense_rates_json)

    # Process the (potentially cached) data
    processed_properties = []
    print ("All properties = " + str(len(all_properties)))
    for prop in all_properties:        
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
        processed_properties.append(prop) #append to new array


    return jsonify(processed_properties) #return the processed array

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)