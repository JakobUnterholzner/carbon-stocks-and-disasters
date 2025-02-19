<template>
    <div class="time-series-chart" ref="chart"></div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from '@/stores/store.js';
import * as d3 from 'd3';

// Access the Pinia store
const store = useStore();

// Computed properties
const carbon = computed(() => store.carbonByCountry);
const disasters = computed(() => store.disastersByCountry);
const selectedDisasterTypes = computed(() => store.selectedDisasterTypes);
const selectedCountries = computed(() => store.selectedCountries);
const highlightedCountries = computed(() => store.highlightedCountries);

// Reactive variables
const svgWidth = ref(1200);
const svgHeight = ref(400);
const svgPadding = { top: 50, right: 70, bottom: 100, left: 70 }; // Adjusted left padding for legend

const chart = ref(null); // Initialize chart reference
const tooltipText = ref(''); // Tooltip text
const tooltipVisible = ref(false); // Tooltip visibility
const tooltipX = ref(10); // Tooltip X position
const tooltipY = ref(10); // Tooltip Y position


const showSizeLegendTooltip = () => {
      tooltipVisible.value = true;
      tooltipText.value = 'Note that the circle size is not reflecting the true country size! The country size is encoded using using a square root scale, which aims to provide a visual representation of the relative size of countries. Please hover the Scatterpoints to see the actual country size.';
    };

const hideSizeLegendTooltip = () => {
  tooltipVisible.value = false;
};

const moveSizeLegendTooltip = (event) => {
  tooltipX.value = event.pageX + 10;
  tooltipY.value = event.pageY - 28;
};


const createTimeSeriesChart = () => {
  const svg = d3.select(chart.value)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '60%')
    .attr('viewBox', `0 0 ${svgWidth.value} ${svgHeight.value}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  // Filter out specified countries and include only selected countries if any are selected and highlighted countries
  const filteredCarbonData = carbon.value.filter(countryData => 
    (selectedCountries.value.length === 0 || selectedCountries.value.includes(countryData.ISO3)) && 
    highlightedCountries.value.length === 0 || highlightedCountries.value.includes(countryData.ISO3) &&
    countryData.ISO3 !== "WLD" && 
    countryData.ISO3 !== "G20" && 
    countryData.ISO3 !== "EMDETMP" && 
    countryData.ISO3 !== "AETMP" && 
    countryData.ISO3 !== "AMETMP" && 
    countryData.ISO3 !== "AFRTMP" && 
    countryData.ISO3 !== "EMU" && 
    countryData.ISO3 !== "G7" && 
    countryData.ISO3 !== "ASIATMP" && 
    countryData.ISO3 !== "OCETMP"
  );

  const xScale = d3.scaleTime()
    .domain([new Date(1991, 0, 1), new Date(2020, 11, 31)])
    .range([svgPadding.left, svgWidth.value - svgPadding.right]);

  let yScaleCarbon;

  // plot individual lines if highlighted countries are selected
  if ((highlightedCountries.value.length < 10 && highlightedCountries.value.length > 0)) {
    // Calculate yScale for individual lines
    yScaleCarbon = d3.scaleLinear()
      .domain([0, d3.max(filteredCarbonData, countryData => {
        const carbonStocks = countryData.carbon.find(c => c.type === 'Carbon stocks');
        return carbonStocks ? d3.max(carbonStocks.yearlyValues, d => d.value) : 0;
      })])
      .nice()
      .range([svgHeight.value - svgPadding.bottom, svgPadding.top]);

    // Draw individual lines and dots for each country
    const line = d3.line()
      .x(d => xScale(new Date(d.year, 0, 1)))
      .y(d => yScaleCarbon(d.value))
      .curve(d3.curveMonotoneX);

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    filteredCarbonData.forEach((countryData, index) => {
      const carbonStocks = countryData.carbon.find(c => c.type === 'Carbon stocks');
      if (carbonStocks) {
        const countryCarbonData = carbonStocks.yearlyValues
          .filter(({ year }) => year >= 1992 && year <= 2020) // Filter data from 1992 to 2020
          .map(({ year, value }) => ({ year, value }))
          .filter(({ year, value }) => !isNaN(value) && !isNaN(year)); // Skip NaN values

        if (countryCarbonData.length > 0) {
          const color = colorScale(index);

          // Draw the line
          svg.append('path')
            .datum(countryCarbonData)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 1.5)
            .attr('d', line);

          // Draw the dots
          svg.selectAll(`.dot-${countryData.ISO3}`)
            .data(countryCarbonData)
            .enter().append('circle')
            .attr('class', `dot-${countryData.ISO3}`)
            .attr('cx', d => xScale(new Date(d.year, 0, 1)))
            .attr('cy', d => yScaleCarbon(d.value))
            .attr('r', 3)
            .attr('fill', color);

          svg.append('text')
            .attr('x', svgPadding.left)
            .attr('y', yScaleCarbon(countryCarbonData[0].value) - 5) // Adjust the y position slightly above the line
            .attr('dy', '0.1em')
            .attr('text-anchor', 'start')
            .style('font-size', '14px')
            .text(countryData.ISO3);
        } else {
          console.warn(`No valid data for country: ${countryData.ISO3}`);
        }
      }
    });
  } else {
    // Plot and Compute the mean carbon stock for each year
    const yearlyCarbonData = {};
    filteredCarbonData.forEach(countryData => {
      const carbonStocks = countryData.carbon.find(c => c.type === 'Carbon stocks');
      if (carbonStocks) {
        carbonStocks.yearlyValues
          .filter(({ year }) => year >= 1992 && year <= 2020) // Filter data from 1992 to 2020
          .forEach(({ year, value }) => {
            if (!isNaN(value) && !isNaN(year)) { // Skip NaN values
              if (!yearlyCarbonData[year]) {
                yearlyCarbonData[year] = { total: 0, count: 0 };
              }
              yearlyCarbonData[year].total += value;
              yearlyCarbonData[year].count += 1;
            }
          });
      }
    });

    const meanCarbonStockData = Object.keys(yearlyCarbonData)
      .filter(year => !isNaN(year)) // Filter out NaN years
      .map(year => ({
        year: +year,
        meanCarbonStock: yearlyCarbonData[year].total / yearlyCarbonData[year].count,
      }));

    // Calculate yScale for mean line
    yScaleCarbon = d3.scaleLinear()
      .domain([0, d3.max(meanCarbonStockData, d => d.meanCarbonStock)])
      .nice()
      .range([svgHeight.value - svgPadding.bottom, svgPadding.top]);

    const line = d3.line()
      .x(d => xScale(new Date(d.year, 0, 1)))
      .y(d => yScaleCarbon(d.meanCarbonStock))
      .curve(d3.curveMonotoneX);

    // Draw the line
    svg.append('path')
      .datum(meanCarbonStockData)
      .attr('fill', 'none')
      .attr('stroke', 'steelblue')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Add dots to the line
    svg.selectAll('.dot')
      .data(meanCarbonStockData)
      .enter().append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(new Date(d.year, 0, 1)))
      .attr('cy', d => yScaleCarbon(d.meanCarbonStock))
      .attr('r', 3)
      .attr('fill', 'steelblue');
    
  // Position the text label just left of the beginning of the line
  svg.append('text')
    .attr('x', svgPadding.left)
    .attr('y', yScaleCarbon(meanCarbonStockData[0].meanCarbonStock))
    .attr('dy', '-0.5em')
    .attr('text-anchor', 'start')
    .style('font-size', '14px')
    .text('Mean');
  }

  /// Compute the total disasters for each year by type
console.log('Disasters:', disasters.value);
const yearlyDisasterData = {};

// Function to process disaster data
const processDisasterData = (countryData) => {
  countryData.disasters.forEach(disaster => {
    disaster.yearlyValues
      .filter(({ year }) => year >= 1992 && year <= 2020) // Filter data from 1992 to 2020
      .forEach(({ year, value }) => {
        if (!isNaN(value) && !isNaN(year)) { // Skip NaN values
          if (!yearlyDisasterData[year]) {
            yearlyDisasterData[year] = {};
          }
          if (!yearlyDisasterData[year][disaster.type]) {
            yearlyDisasterData[year][disaster.type] = 0;
          }
          yearlyDisasterData[year][disaster.type] += value;
        }
      });
  });
};

// Process highlighted countries if any
if (highlightedCountries.value.length > 0) {
  disasters.value.forEach(countryData => {
    if (highlightedCountries.value.includes(countryData.ISO3)) {
      processDisasterData(countryData);
    }
  });
} else if (selectedCountries.value.length > 0) {
  // Process selected countries if no highlighted countries
  disasters.value.forEach(countryData => {
    if (selectedCountries.value.includes(countryData.ISO3)) {
      processDisasterData(countryData);
    }
  });
} else {
  // Process all countries if no highlighted or selected countries
  disasters.value.forEach(countryData => {
    processDisasterData(countryData);
  });
}
console.log('Yearly Disaster Data:', yearlyDisasterData);

  const disasterTypes = [
    'Flood', // Blue
    'Drought', // Orange
    'Landslide', // Green
    'Extreme temperature', // Red
    'Storm', // Purple
    'Wildfire' // Brown
  ];

  const filteredDisasterTypes = disasterTypes.filter(type => store.selectedDisasterTypes.includes(type));

  const totalDisastersData = Object.keys(yearlyDisasterData)
    .filter(year => !isNaN(year)) // Filter out NaN years
    .map(year => ({
      year: +year,
      ...disasterTypes.reduce((acc, type) => {
        acc[type] = yearlyDisasterData[year][type] || 0;
        return acc;
      }, {})
    }));

  ////////////////////////////////////////////////////////////////////////////////////////////////////
  // CREATE THE Bars And Axis ////////////////////////////////////////////////////////////////////////////
  // Define custom color scale for disasters
  const colorScale = d3.scaleOrdinal()
    .domain(disasterTypes)
    .range(d3.schemeCategory10);

  // Stack the disaster data
  const stack = d3.stack()
    .keys(filteredDisasterTypes)
    .order(d3.stackOrderNone)
    .offset(d3.stackOffsetNone);

  const stackedData = stack(totalDisastersData);

  // Determine the title based on selected countries
  let titleText;
  if (highlightedCountries.value.length > 0) {
    titleText = `Carbon stocks in forests and Disasters (1992-2020) for ${highlightedCountries.value.join(', ')}`;
  } else if (selectedCountries.value.length > 0) {
    titleText = `Carbon stocks in forests and Disasters (1992-2020) for the ${selectedCountries.value.length} selected countries `;
  } else {
    titleText = 'Carbon stocks in forests and Disasters (1992-2020) - World Mean';
  }

  // Append title to the SVG container
  svg.append('text')
    .attr('y', svgPadding.top / 2) // Position the title at the top
    .attr('x', svgWidth.value / 2) // Center the title horizontally
    .attr('text-anchor', 'middle') // Center the text
    .style('font-size', '16px') // Set the font size
    .style('font-weight', 'bold') // Set the font weight
    .text(titleText);

  // Define yScaleDisasters
  const yScaleDisasters = d3.scaleLinear()
    .domain([0, d3.max(totalDisastersData, d => d3.sum(filteredDisasterTypes.map(type => d[type])))])
    .nice()
    .range([svgHeight.value - svgPadding.bottom, svgPadding.top]);

  // Create bars for disasters
  svg.selectAll('g')
    .data(stackedData)
    .enter()
    .append('g')
    .attr('fill', d => colorScale(d.key))
    .selectAll('rect')
    .data(d => d)
    .enter()
    .append('rect')
    .attr('x', d => xScale(new Date(d.data.year, 0, 1)) - 10) // Adjust bar width and position
    .attr('y', d => yScaleDisasters(d[1]))
    .attr('width', 20)
    .attr('height', d => yScaleDisasters(d[0]) - yScaleDisasters(d[1]))
    .attr('opacity', 0.8);

  // Add X axis
  svg.append('g')
    .attr('transform', `translate(0,${svgHeight.value - svgPadding.bottom})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.timeFormat("%Y")))
    .selectAll('text')
    .attr('font-size', '14px');

  // Add Y axis for carbon stock
  svg.append('g')
    .attr('transform', `translate(${svgPadding.left},0)`)
    .call(d3.axisLeft(yScaleCarbon))
    .selectAll('text')
    .style('font-size', '14px');

  // Add Y axis for disasters
  svg.append('g')
    .attr('transform', `translate(${svgWidth.value - svgPadding.right},0)`)
    .call(d3.axisRight(yScaleDisasters))
    .selectAll('text')
    .style('font-size', '14px');

  // Determine the y-axis label text based on the number of selected countries
  const yAxisLabelTextCarbon = (highlightedCountries.value.length > 0 && highlightedCountries.value.length < 10) ? 'Carbon stocks (MtCO₂)' : 'Mean Carbon stocks (MtCO₂)';



  ////////////////////////////////////////////////////////////////////////////////////////////////////
  // CREATE THE TOOLTIP & CONTROL PANEL ////////////////////////////////////////////////////////////////////////////
  // Create a tooltip
  const tooltip = d3.select(chart.value)
    .append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0)
    .style('position', 'absolute')
    .style('text-align', 'center')
    .style('width', '280px')
    .style('height', 'auto')
    .style('padding', '10px')
    .style('font', '14px sans-serif')
    .style('background', 'rgba(255, 255, 224, 0.9)') // Light yellow background color
    .style('border', '1px solid #ccc') // Small border
    .style('border-radius', '4px')
    .style('pointer-events', 'none')
    .style('box-shadow', '0px 0px 10px rgba(0, 0, 0, 0.1)'); // Light shadow for better visibility

  // Add Y axis label for carbon stock
  svg.append('text')
    .attr('class', 'y-axis-label')
    .attr('text-anchor', 'end')
    .attr('x', -svgPadding.top)
    .attr('y', svgPadding.left - 55)
    .attr('transform', 'rotate(-90)')
    .attr('font-size', '18px')
    .text(yAxisLabelTextCarbon)
    .on('mouseover', function(event) {
      tooltip.transition()
        .duration(200)
        .style('opacity', .9);
      tooltip.html('If only one country is selected, the carbon stock in forest is shown for this country. If multiple countries are selected, the mean carbon stock in forest over the selected countries is shown.')
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 28) + 'px');
    })
    .on('mouseout', () => {
      tooltip.transition()
        .duration(500)
        .style('opacity', 0);
    })


  // Determine the y-axis label text based on the number of selected countries
  const yAxisLabelText = (highlightedCountries.value.length === 1 || selectedCountries.value.length === 1) ? 'Number of Disasters' : 'Summed Number of Disasters';

  // Add Y axis label for disasters
  svg.append('text')
    .attr('class', 'y-axis-label')
    .attr('text-anchor', 'end')
    .attr('x', -svgPadding.top)
    .attr('y', svgWidth.value - svgPadding.right + 55)
    .attr('transform', 'rotate(-90)')
    .attr('font-size', '18px')
    .text(yAxisLabelText)
    .on('mouseover', function(event) {
      tooltip.transition()
        .duration(200)
        .style('opacity', .9);
      tooltip.html('If only one country is selected, the number of disasters for this country is shown. If multiple countries are selected, the sum of disasters over the selected countries is shown.')
        .style('left', (event.pageX - 300) + 'px')
        .style('top', (event.pageY - 28) + 'px');
    })
    .on('mouseout', () => {
      tooltip.transition()
        .duration(500)
        .style('opacity', 0);
    })

};

onMounted(async () => {
  await store.loadData();
  createTimeSeriesChart();

  // log the data
  console.log('Carbon Data:', carbon.value);
  console.log('Disasters Data:', disasters.value);
  console.log('Selected Disaster Types:', selectedDisasterTypes.value);
});

// Watch for changes in svgWidth, svgHeight, selectedDisasterTypes, selectedCountries, and highlightedCountries and update the chart
watch([svgWidth, svgHeight, selectedDisasterTypes, selectedCountries, highlightedCountries], () => {
  d3.select(chart.value).select('svg').remove(); 
  createTimeSeriesChart();
}, { deep: true });
</script>

<style scoped>
body, html {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
}

.custom-tooltip {
  position: absolute;
  width: 280px;
  background-color: rgba(255, 255, 224, 0.9);
  color: black;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  white-space: normal;
  font-size: 14px;
  z-index: 100; 
  box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.2s;
}

.custom-tooltip[v-show="true"] {
  opacity: 1;
}

</style>