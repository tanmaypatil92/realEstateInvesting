// script.js (Corrected version - Addressing Sidebar Issue)

let map;
let controlsTimeout;
let sidebarTimeout;
let markerMap = new Map(); //  zpid: marker
let rankedProperties = new Map(); //  zpid: property  (for ranked properties)
let eventSource;

function calculateMapHeight() {
    const sidebarWidth = window.innerWidth <= 768 ? 0 : 320;
    return window.innerHeight;
}

function setMapContainerHeight() {
    const mapContainer = document.getElementById('map-container');
    mapContainer.style.height = `${calculateMapHeight()}px`;
    const sidebarWidth = window.innerWidth <= 768 ? 0 : 320;
    mapContainer.style.width = `calc(100% - ${sidebarWidth}px)`;
}

function initializeMap() {
    if (!map) {
        setMapContainerHeight();
        map = L.map('map').setView([33.92, -84.28], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        // Remove map.on listener, as controls are now always visible
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

// Removed showControls and hideControls, and related event listeners

function showSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.add('visible');
    sidebar.classList.remove('hidden');
    clearTimeout(sidebarTimeout);
}

function hideSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.add('hidden');
    sidebar.classList.remove('visible');
}


function updateSidebar(property) {
    if (!property.rank) return;  // Only add/update ranked properties

    const sidebarContent = document.getElementById('sidebar-content');
    const existingProperty = sidebarContent.querySelector(`.sidebar-property[data-zpid="${property.zpid}"]`); // Corrected selector

    if (existingProperty) {
        existingProperty.innerHTML = createPropertyHTML(property);
    } else {
        const propertyDiv = document.createElement('div');
        propertyDiv.classList.add('sidebar-property');
        propertyDiv.dataset.zpid = property.zpid;  // Set data-zpid attribute
        propertyDiv.innerHTML = createPropertyHTML(property);
        propertyDiv.addEventListener('mouseover', () => highlightMarker(property.rank));
        propertyDiv.addEventListener('mouseout', () => resetMarker(property.rank));
        sidebarContent.appendChild(propertyDiv);
    }
    showSidebar();
}

function createPropertyHTML(property){
    let addressLink = "";
    if (property.zpid) {
        addressLink = `
            <b><a href="https://www.zillow.com/homedetails/<span class="math-inline">\{property\.zpid\}\_zpid/" target\="\_blank"\></span>{property.rank}. ${property.streetAddress}, ${property.city}, ${property.state} ${property.zipcode}</a></b><br>
        `;
    } else {
        addressLink = `
            <b>${property.rank}. ${property.streetAddress}, ${property.city}, ${property.state} ${property.zipcode}</b><br>
        `;
    }
    return `
        ${addressLink}
        Price: $${property.price.toLocaleString()}<br>
        Rent: $${property.rentZestimate.toLocaleString()}<br>
        Bedrooms: ${property.bedrooms}, Bathrooms: ${property.bathrooms}<br>
        ${property.homeType !== null ? `Home Type: ${property.homeType}<br>` : ''}
        ${property.cash_on_cash_return !== null ? `Cash-on-Cash Return: ${property.cash_on_cash_return.toFixed(2)}%<br>` : ''}
        ${property.daysOnZillow !== null ? `Days on Zillow: ${property.daysOnZillow}<br>` : ''}
        ${property.details && property.details.schools && property.details.schools[0] && property.details.schools[0].rating !== null ? `School Rating: ${property.details.schools[0].rating.toLocaleString()} | ` : ''}
        ${property.details && property.details.schools && property.details.schools[1] && property.details.schools[1].rating !== null ? `${property.details.schools[1].rating.toLocaleString()} | ` : ''}
        ${property.details && property.details.schools && property.details.schools[2] && property.details.schools[2].rating !== null ? `${property.details.schools[2].rating.toLocaleString()}<br>` : ''}
        <hr>
    `;
}

// Function to highlight a marker
function highlightMarker(rank) {
  // Find marker using rank
    for (let [zpid, marker] of markerMap) {
        const property = rankedProperties.get(zpid);
        if (property && property.rank === rank) {
            const icon = marker.getIcon();
            icon.options.originalSize = icon.options.iconSize;
            icon.options.originalAnchor = icon.options.iconAnchor;
            icon.options.iconSize = [32, 32];
            icon.options.iconAnchor = [16, 32];
            marker.setIcon(icon);
            marker.setZIndexOffset(1000);
            break; // Important: Stop searching once found
        }
    }
}

// Function to reset a marker's style
function resetMarker(rank) {
  // Find marker using rank
    for (let [zpid, marker] of markerMap) {
        const property = rankedProperties.get(zpid);
        if (property && property.rank === rank) {
          const icon = marker.getIcon();
          if (icon.options.originalSize) {
                icon.options.iconSize = icon.options.originalSize;
                icon.options.iconAnchor = icon.options.originalAnchor;
                marker.setIcon(icon);
          }
          marker.setZIndexOffset(0);
          break;// Important: Stop searching once found
        }
    }
}


function updateMap() {
    const zillowUrl = document.getElementById('zillowUrl').value;
    if (!zillowUrl) {
        alert("Please enter a Zillow URL.");
        return;
    }

    showLoadingIndicator();
    //  hideControls() is removed

    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }

    if (map) {
        map.eachLayer(layer => {
            if (layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });
    }
    markerMap.clear();
    rankedProperties.clear(); // Clear the ranked properties
    document.getElementById('sidebar-content').innerHTML = '';

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

    eventSource = new EventSource(url);
    let bounds = L.latLngBounds();
    let validProperties = false;

    // ... inside eventSource.onmessage = function(event) { ...

    eventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);

        // ... (previous error handling and end_of_stream handling) ...
        if (data.error) {
            console.error("Error from server:", data.error);
            alert(`Error: ${data.error}`);
            hideLoadingIndicator();
            eventSource.close();
            return;
        }

        if (data.end_of_stream) {
            console.log("End of stream received");
            eventSource.close();
            hideLoadingIndicator();
            if (validProperties) {
                map.fitBounds(bounds); //Final fit bounds
            }
            map.invalidateSize();
            return;
        }


        // --- Main Property Handling ---
        if (data.latitude && data.longitude) {
            // ... (marker color, icon creation, etc. - all the same) ...
            let markerColorClass = 'gray-marker';
            if (data.cash_on_cash_return !== null && data.rentZestimate != 0) {
                markerColorClass = data.cash_on_cash_return < -8 ? 'red-marker' :
                                  data.cash_on_cash_return < -4 ? 'orange-marker' :
                                  data.cash_on_cash_return < 0  ? 'yellow-marker' :
                                                                  'green-marker';
            }
            if (data.homeType && (data.homeType.toLowerCase() === 'townhouse' || data.homeType.toLowerCase() === 'condo')) {
                markerColorClass += ' square';
            }

            let iconHtml = data.rank ? `<div class="marker-rank">${data.rank}</div>` : '';
            const customIcon = L.divIcon({
                className: markerColorClass,
                html: iconHtml,
                iconSize: data.rank ? [16, 16] : [12, 12],
                iconAnchor: data.rank ? [14, 14] : [10, 10],
            });

            // Use zpid as the key for markerMap
            let marker = markerMap.get(data.zpid);
            if (!marker) {
                marker = L.marker([data.latitude, data.longitude], { icon: customIcon });
                markerMap.set(data.zpid, marker); // Store by zpid
                marker.addTo(map);
            } else {
                marker.setLatLng([data.latitude, data.longitude]);
                marker.setIcon(customIcon); // Update icon (in case rank changed)
            }

            // --- Popup Content --- (same as before)
            let popupContent = data.zpid
                ? `<b><a href="https://www.zillow.com/homedetails/${data.zpid}_zpid/" target="_blank">${data.streetAddress}, ${data.city}, ${data.state} ${data.zipcode}</a></b><br>`
                : `<b>${data.streetAddress}, ${data.city}, ${data.state} ${data.zipcode}</b><br>`;
            popupContent += `Price: $${data.price.toLocaleString()}<br>Rent: $${data.rentZestimate.toLocaleString()}<br>Bedrooms: ${data.bedrooms}<br>Bathrooms: ${data.bathrooms}<br>Living Area: ${data.livingArea} sqft<br>Home Type: ${data.homeType}<br>`;
            popupContent += data.rent_to_price_ratio !== null ? `Rent-to-Price Ratio: ${data.rent_to_price_ratio.toFixed(2)}%<br>` : '';
            popupContent += data.annual_cash_flow !== null && data.cash_on_cash_return !== null ? `Annual Cash Flow: $${data.annual_cash_flow.toFixed(2)}<br>Cash-on-Cash Return: ${data.cash_on_cash_return.toFixed(2)}%` : 'Cash Flow/Return: N/A';
            marker.bindPopup(popupContent);

            marker.on('mouseover', function (e) { this.openPopup(); });
            marker.on('mouseout', function (e) { this.closePopup(); });
            marker.on('click', function () { if (data.zpid) { window.open(`https://www.zillow.com/homedetails/${data.zpid}_zpid/`, '_blank'); } });


            bounds.extend([data.latitude, data.longitude]); // Extend bounds *every* time
            validProperties = true;

            // --- Centering and Zooming Logic ---
            if (validProperties) {
                 map.fitBounds(bounds);  // Fit bounds *every* time
            }
            if (data.rank) {
                rankedProperties.set(data.zpid, data);
                updateSidebar(data);
            }

        }
    };

    eventSource.onerror = function(error) {
        console.error("EventSource failed:", error);
        alert("Error: Could not connect to the server for live updates.");
        hideLoadingIndicator();
        eventSource.close();
    };
}

document.getElementById('updateButton').addEventListener('click', updateMap);
// Removed controls event listeners
window.addEventListener('resize', () => { setMapContainerHeight(); if (map) { map.invalidateSize(); } });
initializeMap();