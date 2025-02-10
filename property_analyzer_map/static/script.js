// script.js

 let map;
 let controlsTimeout; // Variable to hold the timeout ID

 function calculateMapHeight() {
     // Since controls are absolutely positioned, the map should take up the full height
     return window.innerHeight;
 }

 function setMapContainerHeight() {
     const mapContainer = document.getElementById('map-container');
     mapContainer.style.height = `${calculateMapHeight()}px`;
 }

 function initializeMap() {
     if (!map) {
         setMapContainerHeight();
         map = L.map('map').setView([33.92, -84.28], 13);

         L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
             attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
         }).addTo(map);

         // Add event listener for map scrolling/interaction
         map.on('mousedown zoomstart movestart', hideControls); // Hide on interaction
     } else {
         setMapContainerHeight();
         map.invalidateSize();
     }
 }

 function showLoadingIndicator() {
     document.getElementById('loading-overlay').style.display = 'flex';
 }

 function hideLoadingIndicator() {
     document.getElementById('loading-overlay').style.display = 'none';
 }

 function showControls() {
     const controls = document.getElementById('controls');
     controls.classList.add('visible');  // Use the 'visible' class
     controls.classList.remove('hidden');
     clearTimeout(controlsTimeout); // Clear any existing timeout
 }

 function hideControls() {
      const controls = document.getElementById('controls');
     controls.classList.add('hidden');  // Add the 'hidden' class
     controls.classList.remove('visible');

 }

 function updateMap() {
     const zillowUrl = document.getElementById('zillowUrl').value;
     if (!zillowUrl) {
         alert("Please enter a Zillow URL.");
         return;
     }

     showLoadingIndicator();
      // Hide controls when updating
     hideControls();

     const loanDetails = {
         down_payment_percentage: parseFloat(document.getElementById('downPayment').value) / 100,
         interest_rate: parseFloat(document.getElementById('interestRate').value) / 100,
         loan_term: parseInt(document.getElementById('loanTerm').value)
     };

     const expenseRates = {
         property_management_rate: parseFloat(document.getElementById('propMgmt').value) / 100,
         vacancy_rate: parseFloat(document.getElementById('vacancy').value) / 100,
         maintenance_rate: parseFloat(document.getElementById('maintenance').value) / 100,
         insurance_rate: parseFloat(document.getElementById('insurance').value) / 100,
         property_taxes_rate: parseFloat(document.getElementById('propTaxes').value) / 100
     };

     const loanDetailsJson = JSON.stringify(loanDetails);
     const expenseRatesJson = JSON.stringify(expenseRates);
     const url = `/api/properties?zillow_url=${encodeURIComponent(zillowUrl)}&loan_details=${encodeURIComponent(loanDetailsJson)}&expense_rates=${encodeURIComponent(expenseRatesJson)}`;

     fetch(url)
         .then(response => {
             if (!response.ok) {
                 throw new Error(`HTTP error! status: ${response.status}`);
             }
             return response.json();
         })
         .then(properties => {
             if (map) {
                 map.eachLayer(layer => {
                     if (layer instanceof L.Marker) {
                         map.removeLayer(layer);
                     }
                 });
             } else {
                 initializeMap();
             }

             const bounds = L.latLngBounds();
             let validProperties = false;

             properties.forEach(property => {
                 if (property.latitude && property.longitude) {
                     let markerColorClass = 'green-marker';
                     if (property.cash_on_cash_return !== null) {
                         if (property.cash_on_cash_return < -4) {
                             markerColorClass = 'red-marker';
                         } else if (property.cash_on_cash_return >= -4 && property.cash_on_cash_return <= 2) {
                             markerColorClass = 'yellow-marker';
                         }
                     }
                     const customIcon = L.divIcon({ className: markerColorClass });
                     const marker = L.marker([property.latitude, property.longitude], { icon: customIcon }).addTo(map);

                     let popupContent = `
                         <b>${property.streetAddress}, ${property.city}, ${property.state} ${property.zipcode}</b><br>
                         Price: $${property.price.toLocaleString()}<br>
                         Bedrooms: ${property.bedrooms}<br>
                         Bathrooms: ${property.bathrooms}<br>
                         Living Area: ${property.livingArea} sqft<br>
                         Home Type: ${property.homeType}<br>
                     `;
                     if (property.rent_to_price_ratio !== null) {
                         popupContent += `Rent-to-Price Ratio: ${property.rent_to_price_ratio.toFixed(2)}%<br>`;
                     }
                     if (property.annual_cash_flow !== null && property.cash_on_cash_return !== null) {
                         popupContent += `Annual Cash Flow: $${property.annual_cash_flow.toFixed(2)}<br>`;
                         popupContent += `Cash-on-Cash Return: ${property.cash_on_cash_return.toFixed(2)}%`;
                     } else {
                         popupContent += `Cash Flow/Return: N/A`;
                     }
                     marker.bindPopup(popupContent);

                     bounds.extend([property.latitude, property.longitude]);
                     validProperties = true;
                 }
             });

             if (validProperties) {
                 map.fitBounds(bounds);
             }
             map.invalidateSize();

         })
         .catch(error => {
             console.error('Error fetching data:', error);
             alert(`Error fetching data: ${error.message}`);
         })
         .finally(() => {
             hideLoadingIndicator();
         });
 }

 // Event listener for the update button
 document.getElementById('updateButton').addEventListener('click', updateMap);

 // Event listeners for showing controls on hover
 const controls = document.getElementById('controls');
 controls.addEventListener('mouseenter', showControls);
  controls.addEventListener('mouseleave', () => {
     controlsTimeout = setTimeout(hideControls, 1000); // Adjust delay as needed (1 second here)
 });

 // Event listener for window resize
 window.addEventListener('resize', () => {
     setMapContainerHeight();
     if (map) {
         map.invalidateSize();
     }
 });

 // Initialize map on load
 initializeMap();