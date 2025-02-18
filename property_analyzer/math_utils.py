
import math

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