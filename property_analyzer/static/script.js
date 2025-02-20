// script.js

let map;
let controlsTimeout; // Variable to hold the timeout ID
let sidebarTimeout;
let markerMap = new Map();


function calculateMapHeight() {
    // Consider the sidebar width
    const sidebarWidth = window.innerWidth <= 768 ? 0 : 320; // Sidebar width, 0 if mobile
    return window.innerHeight;
}

function setMapContainerHeight() {
    const mapContainer = document.getElementById('map-container');
    mapContainer.style.height = `${calculateMapHeight()}px`;
    const sidebarWidth = window.innerWidth <= 768 ? 0 : 320; // Get sidebar width
    mapContainer.style.width = `calc(100% - ${sidebarWidth}px)`;
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


function updateSidebar(properties) {
    const sidebarContent = document.getElementById('sidebar-content');
    sidebarContent.innerHTML = ''; // Clear previous content

    const validProperties = properties.filter(property => typeof property.rank === 'number');
    const topProperties = validProperties.sort((a, b) => a.rank - b.rank).slice(0, 10);

    topProperties.forEach(property => {
        const propertyDiv = document.createElement('div');
        propertyDiv.classList.add('sidebar-property');

        let addressLink = "";
        if (property.zpid) {
            addressLink = `
                <b><a href="https://www.zillow.com/homedetails/${property.zpid}_zpid/" target="_blank">${property.rank}. ${property.streetAddress}, ${property.city}, ${property.state} ${property.zipcode}</a></b><br>
            `;
        } else {
            addressLink = `
                <b>${property.rank}. ${property.streetAddress}, ${property.city}, ${property.state} ${property.zipcode}</b><br>
            `;
        }
        propertyDiv.innerHTML = `
            ${addressLink}
            Price: $${property.price.toLocaleString()}<br>
            Rent: $${property.rentZestimate.toLocaleString()}<br>
            Bedrooms: ${property.bedrooms}, Bathrooms: ${property.bathrooms}<br>
            ${property.homeType !== null ? `Home Type: ${property.homeType}<br>` : ''}
            ${property.cash_on_cash_return !== null ? `Cash-on-Cash Return: ${property.cash_on_cash_return.toFixed(2)}%<br>` : ''}
            ${property.daysOnZillow !== null ? `Days on Zillow: ${property.daysOnZillow}<br>` : ''}
            ${property.details.schools[0].rating !== null ? `Schools Ratings: ${property.details.schools[0].rating.toLocaleString()} | ${property.details.schools[1].rating.toLocaleString()} | ${property.details.schools[2].rating.toLocaleString()}<br>` : ''}
            <hr>
        `;

        // Add mouseover and mouseout event listeners
        propertyDiv.addEventListener('mouseover', () => {
            highlightMarker(property.rank);
        });
        propertyDiv.addEventListener('mouseout', () => {
            resetMarker(property.rank);
        });

        sidebarContent.appendChild(propertyDiv);
    });
    showSidebar();
}

// Function to highlight a marker
function highlightMarker(rank) {
    const marker = markerMap.get(rank);
    if (marker) {
        const icon = marker.getIcon();
        // Store original size and anchor
        icon.options.originalSize = icon.options.iconSize;
        icon.options.originalAnchor = icon.options.iconAnchor;

        // Increase size and adjust anchor
        icon.options.iconSize = [32, 32]; // Example larger size
        icon.options.iconAnchor = [16, 32]; // Adjust anchor accordingly
        marker.setIcon(icon);
        marker.setZIndexOffset(1000); // Bring to front

    }
}

// Function to reset a marker's style
function resetMarker(rank) {
    const marker = markerMap.get(rank);
    if (marker) {
        const icon = marker.getIcon();
        // Restore original size and anchor
        if (icon.options.originalSize) {
            icon.options.iconSize = icon.options.originalSize;
            icon.options.iconAnchor = icon.options.originalAnchor;
            marker.setIcon(icon);
        }

        marker.setZIndexOffset(0); // Reset Z-index
    }
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
            markerMap.clear(); // Clear the map

            const bounds = L.latLngBounds();
            let validProperties = false;

            properties.forEach(property => {
                if (property.latitude && property.longitude) {
                    let markerColorClass = 'gray-marker';
                    if (property.cash_on_cash_return !== null && property.rentZestimate != 0) {
                        if (property.cash_on_cash_return < -8) {
                            markerColorClass = 'red-marker';
                        } else if (property.cash_on_cash_return >= -8 && property.cash_on_cash_return < -4) {
                            markerColorClass = 'orange-marker';
                        } else if (property.cash_on_cash_return >= -4 && property.cash_on_cash_return < 0) {
                            markerColorClass = 'yellow-marker';
                        } else {
                            markerColorClass = 'green-marker';
                        }
                    }

                    // Add square class if it's a townhome or condo
                    if (property.homeType && (property.homeType.toLowerCase() === 'townhouse' || property.homeType.toLowerCase() === 'condo')) {
                        markerColorClass += ' square';
                    }

                    // Create the custom icon with the rank number *inside* the marker.
                    let iconHtml = '';
                    if (property.rank) {
                        iconHtml = `<div class="marker-rank">${property.rank}</div>`;
                    }

                    const customIcon = L.divIcon({
                        className: markerColorClass,
                        html: iconHtml, // Add the rank HTML here
                        iconSize: property.rank ? [16, 16] : [12, 12],  // Adjust size if it has a rank
                        iconAnchor: property.rank ? [14, 14] : [10, 10],    // Adjust anchor accordingly
                    });
                    const marker = L.marker([property.latitude, property.longitude], { icon: customIcon });

                    // Create the address link.  Critically, check for a valid zpid.
                    let popupContent = "";
                    if (property.zpid) {
                        popupContent = `
                            <b><a href="https://www.zillow.com/homedetails/${property.zpid}_zpid/" target="_blank">${property.streetAddress}, ${property.city}, ${property.state} ${property.zipcode}</a></b><br>
                        `;
                    }
                    else {
                        popupContent = `
                         <b>${property.streetAddress}, ${property.city}, ${property.state} ${property.zipcode}</b><br>
                        `;
                    }


                    popupContent += `
                        Price: $${property.price.toLocaleString()}<br>
                        Rent: $${property.rentZestimate.toLocaleString()}<br>
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

                    // Add event listeners for hover
                    marker.on('mouseover', function (e) {
                        this.openPopup();
                    });
                    marker.on('mouseout', function (e) {
                        this.closePopup();
                    });

                    // Add click listener to open Zillow link
                    marker.on('click', function () {
                        if (property.zpid) {
                            window.open(`https://www.zillow.com/homedetails/${property.zpid}_zpid/`, '_blank');
                        }
                    });


                    marker.addTo(map); // Add marker to the map *after* setting up event listeners

                    bounds.extend([property.latitude, property.longitude]);
                    validProperties = true;

                    // Store the marker in the markerMap, using the rank as the key
                    markerMap.set(property.rank, marker);
                }
            });

            if (validProperties) {
                map.fitBounds(bounds);
            }
            map.invalidateSize();
            updateSidebar(properties); // Update the sidebar

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