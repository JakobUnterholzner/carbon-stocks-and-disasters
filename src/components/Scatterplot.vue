<template>
  <div class="scatterplot" ref="chart"></div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from '@/stores/store.js';
import * as d3 from 'd3';

// Access the Pinia store
const store = useStore();

// Computed properties
const disasters = computed(() => store.disastersByCountry);
const carbon = computed(() => store.carbonByCountry);
const selectedDisasterTypes = computed(() => store.selectedDisasterTypes);
const selectedCountries = computed(() => store.selectedCountries);
const highlightedCountries = computed(() => store.highlightedCountries);
const normalizeData = computed(() => store.normalizeData);

// Reactive variables
const svgWidth = ref(600);
const svgHeight = ref(600);
const svgPadding = { top: 25, right: 25, bottom: 50, left: 50 };
const chart = ref(null); // Initialize chart reference

const createScatterplot = () => {
  const svg = d3.select(chart.value)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${svgWidth.value} ${svgHeight.value}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .on('click', () => {
      store.setSelectedCountries([]); // Reset selection when clicking inside the plot
      store.resetHighlightedCountries([]); // Reset highlight when clicking inside the plot
      d3.select(chart.value).select('svg').remove();
      createScatterplot();
    });
  
  ////////////////////////////////////////////////////////////////////////////////////////////////////
  // DATA TRANSFORMATION AND FILTERING ///////////////////////////////////////////////////////////////
  // Combine the data and filter out "ACQ"
  let combinedData = disasters.value
    .filter(disasterCountry => disasterCountry.ISO3 !== "ACQ")
    .map(disasterCountry => {
      const carbonCountry = carbon.value.find(c => c.ISO3 === disasterCountry.ISO3);

      // Aggregate the yearly values for each disaster type only for the selected disaster types
      const yearlyDisasters = {};
      disasterCountry.disasters
        .filter(disaster => selectedDisasterTypes.value.includes(disaster.type))
        .forEach(disaster => {
          if (disaster.yearlyValues) {
            disaster.yearlyValues.forEach(({ year, value }) => {
              if (!yearlyDisasters[year]) {
                yearlyDisasters[year] = 0;
              }
              yearlyDisasters[year] += value;
            });
          } else {
            console.warn('yearlyValues is undefined for disaster:', disaster); // Log a warning if yearlyValues is undefined
          }
        });

      // Sum the aggregated yearly values to get the total disasters
      const totalDisasters = Object.values(yearlyDisasters).reduce((acc, val) => acc + val, 0);

      // Compute the mean of the yearly values for carbon stocks
      const carbonStocks = carbonCountry ? carbonCountry.carbon.find(c => c.type === 'Carbon stocks') : null;
      const validYears = carbonStocks ? carbonStocks.yearlyValues
        .filter(val => !isNaN(val.value))
        .filter(({ year }) => year >= 1992 && year <= 2020) // Filter data from 1992 to 2020
        : [];
      const totalYears = validYears.length;
      const totalCarbonStocks = totalYears > 0 ? validYears.reduce((acc, val) => acc + val.value, 0) : 0;
      const meanCarbonStocks = totalYears > 0 ? totalCarbonStocks / totalYears : 0;


      // Get the 'Index of forest extent' for the last year
      const forestExtent = carbonCountry ? carbonCountry.carbon.find(c => c.type === 'Index of forest extent') : null;
      const validYearlyValues = forestExtent ? forestExtent.yearlyValues.filter(v => !isNaN(v.year) && !isNaN(v.value)) : [];
      const forestExtentIndex = validYearlyValues.length > 0 ? validYearlyValues[validYearlyValues.length - 1].value - 100 : -100;

      // Get the land area
      const landArea = carbonCountry ? carbonCountry.carbon.find(c => c.type === 'Land area')?.yearlyValues.find(value => !isNaN(value.value))?.value : null;
      if (landArea === null || landArea === undefined || landArea === 0) {
        console.warn(`Land Area is missing or zero for country: ${disasterCountry.ISO3}`);
        return null; // Skip this country if land area is missing or zero
      }

      // Log values for debugging
      //console.log(`Country: ${disasterCountry.ISO3}, Total Carbon Stocks: ${totalCarbonStocks}, Total Disasters: ${totalDisasters}, Land Area: ${landArea}, Forest Extent Index: ${forestExtentIndex}`);

      // Normalize the total carbon stocks and total disasters by the land area if normalization is enabled
      const normalizedCarbonStocks = normalizeData.value ? meanCarbonStocks*10/ landArea: meanCarbonStocks;
      const normalizedDisasters = normalizeData.value ? totalDisasters*10/ landArea: totalDisasters; //Disaster per 1000Ha -> Disaster per 100Ha = Disaster per km2

      // Check for NaN values
      if (isNaN(normalizedCarbonStocks) || isNaN(normalizedDisasters) || isNaN(forestExtentIndex)) {
        console.error(`NaN detected for country: ${disasterCountry.ISO3}`);
      }

      return {
        ISO3: disasterCountry.ISO3,
        country: disasterCountry.country,
        totalDisasters: normalizedDisasters,
        meanCarbonStocks: normalizedCarbonStocks,
        forestExtentIndex,
        countrySize: landArea
      };
    })
    .filter(d => d !== null); // Filter out null values

  // Filter combinedData based on selectedCountries if not empty
  if (selectedCountries.value && selectedCountries.value.length > 0) {
    combinedData = combinedData.filter(d => selectedCountries.value.includes(d.ISO3));
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////
  // SCATTERPLOT CREATION ////////////////////////////////////////////////////////////////////////////
  // Define scales
  const xScale = d3.scaleLinear()
    .domain([0, d3.max(combinedData, d => d.meanCarbonStocks * 1.1)])
    .nice()
    .range([svgPadding.left, svgWidth.value - svgPadding.right]);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(combinedData, d => d.totalDisasters)])
    .nice()
    .range([svgHeight.value - svgPadding.bottom, svgPadding.top]);

  // Define color scale
  const colorScale = d3.scaleQuantize()
    .domain([-30, 30]) // Adjusted domain to reflect the change in forest extent index
    .range(d3.schemeRdYlGn[7]);

  // Define size scale for country size
  //const min = d3.min(combinedData, d => d.countrySize);
  //const max = d3.max(combinedData, d => d.countrySize);
  // I found it better to set the min and max values manually as else the circle sizes become misleading
  // if for instance to countries with the same size are compared, but one is represented much larger than the other
  const min = 1000;
  const max = 1000000;
  const sizeScale = d3.scaleSqrt()
    .domain([min, max]) //1000 HA unit -> domain(10.000km², 1.000.000km²)
    .range([5, 30]);

  // Define debounce function to limit the number of setSelectedCountries calls
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Debounced version of setSelectedCountries
  const debouncedSetSelectedCountries = debounce((zoomedCountries) => {
    store.setSelectedCountries(zoomedCountries);
  }, 5000); // Adjust the delay as needed

  // Define zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([1, 100]) // Set the zoom scale extent
    .on('zoom', (event) => {
      const transform = event.transform;
      const newXScale = transform.rescaleX(xScale);
      const newYScale = transform.rescaleY(yScale);

      svg.selectAll('circle')
        .attr('cx', d => newXScale(d.meanCarbonStocks))
        .attr('cy', d => newYScale(d.totalDisasters));

      svg.selectAll('.x-axis')
        .call(d3.axisBottom(newXScale))
        .selectAll('text')
        .style('font-size', '15px');
      svg.selectAll('.y-axis')
        .call(d3.axisLeft(newYScale))
        .selectAll('text')
        .style('font-size', '15px');

      // Filter countries within the zoomed area
      const zoomedCountries = combinedData.filter(d => 
        newXScale(d.meanCarbonStocks) >= svgPadding.left &&
        newXScale(d.meanCarbonStocks) <= svgWidth.value - svgPadding.right &&
        newYScale(d.totalDisasters) >= svgPadding.top &&
        newYScale(d.totalDisasters) <= svgHeight.value - svgPadding.bottom
      ).map(d => d.ISO3);
      
      // only update the selected countries if they are different from the current selection
      if (JSON.stringify(zoomedCountries) !== JSON.stringify(selectedCountries.value)) {
        debouncedSetSelectedCountries(zoomedCountries);
      }
    });
  svg.call(zoom);

  // Define clip path which is needed for zooming
  svg.append('defs').append('clipPath')
    .attr('id', 'clip')
    .append('rect')
    .attr('x', svgPadding.left)
    .attr('y', svgPadding.top)
    .attr('width', svgWidth.value - svgPadding.left - svgPadding.right + 20)
    .attr('height', svgHeight.value - svgPadding.top - svgPadding.bottom);

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
    .style('font', '16px sans-serif')
    .style('background', 'rgba(255, 255, 224, 0.9)') // Light yellow background color
    .style('border', '1px solid #ccc')
    .style('border-radius', '4px')
    .style('pointer-events', 'none')
    .style('box-shadow', '0px 0px 10px rgba(0, 0, 0, 0.1)');

  // Create dots
  svg.append('g')
    .attr('clip-path', 'url(#clip)')
    .selectAll('circle')
    .data(combinedData)
    .enter()
    .append('circle')
    .attr('cx', d => xScale(d.meanCarbonStocks))
    .attr('cy', d => yScale(d.totalDisasters))
    //.attr('r', d => normalizeData.value ? 5 : sizeScale(d.countrySize)) // Conditionally set the radius
    .attr('r', d => sizeScale(d.countrySize)) // Set a fixed radius
    .attr('fill', d => colorScale(d.forestExtentIndex))
    .attr('stroke', 'black')
    .attr('stroke-width', d => highlightedCountries.value.includes(d.ISO3) ? 4 : 0.5)
    .on('mouseover', function(event, d) {
      tooltip.transition()
        .duration(200)
        .style('opacity', .9);
      tooltip.html(`${d.country} - ${d.ISO3} <br> Forest Extend Change: ${d.forestExtentIndex.toFixed(0)}% <br> Country Size: ${new Intl.NumberFormat('de-DE').format(d.countrySize.toFixed(0) * 100)} km²`)
        .style('left', (event.pageX + 5) + 'px')
        .style('top', (event.pageY - 28) + 'px');
      store.addMouseOverCountry(d.ISO3);
      console.log('Mouseover:', d.ISO3);
    })
    .on('mouseout', () => {
      tooltip.transition()
        .duration(500)
        .style('opacity', 0);
      store.removeMouseOverCountry();
    })
    .on('click', function(event, d) {
      event.stopPropagation();
      tooltip.transition()
        .duration(500)
        .style('opacity', 0); // Hide the tooltip on click
      if (highlightedCountries.value.includes(d.ISO3)) {
        store.removeHighlightedCountry(d.ISO3);
      } else {
        store.addHighlightedCountry(d.ISO3); 
      }
      store.removeMouseOverCountry();
    });

  // Add X axis
  svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${svgHeight.value - svgPadding.bottom})`)
    .call(d3.axisBottom(xScale))
    .selectAll('text')
    .style('font-size', '13px');

  // Add Y axis
  svg.append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${svgPadding.left},0)`)
    .call(d3.axisLeft(yScale))
    .selectAll('text')
    .style('font-size', '15px');

  // Add X axis label
  svg.append('text')
    .attr('class', 'x-axis-label')
    .attr('text-anchor', 'end')
    .attr('x', svgWidth.value - svgPadding.right)
    .attr('y', svgHeight.value - 10)
    .attr('font-size', '18px')
    .text(normalizeData.value ? 'Carbon stocks (MtCO₂ / km²)' : 'Carbon stocks (MtCO₂)');

  // Add Y axis label
  svg.append('text')
    .attr('class', 'y-axis-label')
    .attr('text-anchor', 'left')
    .attr('x', svgPadding.left/ 2) // Position it horizontally centered above the y-axis
    .attr('y', svgPadding.top - 10) // Position it above the y-axis
    .attr('font-size', '18px')
    .text(normalizeData.value ? 'Disasters / km²' : 'Disasters');

const legend = svg.append('g')
  .attr('class', 'legend')
  .attr('transform', `translate(${svgWidth.value - svgPadding.right - 200}, ${svgPadding.top})`);

const legendScale = d3.scaleLinear()
  .domain(colorScale.domain())
  .range([0, 150]);

const legendAxis = d3.axisBottom(legendScale)
  .tickValues([...colorScale.range().map(d => colorScale.invertExtent(d)[0]), 30])
  .tickFormat(d3.format(".0f"));

legend.selectAll('rect')
  .data(colorScale.range().map(d => colorScale.invertExtent(d)))
  .enter().append('rect')
  .attr('x', d => legendScale(d[0]) +20)
  .attr('y', 0)
  .attr('width', d => legendScale(d[1]) - legendScale(d[0]))
  .attr('height', 25)
  .attr('fill', d => colorScale(d[0]));

legend.append('g')
  .attr('transform', 'translate(20, 25)')
  .call(legendAxis)
  .selectAll('text')
  .style('font-size', '14px');

legend.append('text')
  .attr('x', 0)
  .attr('y', -10)
  .attr('text-anchor', 'start')
  .style('font-size', '18px')
  .text('Forest Extent Change (%)');
};

onMounted(async () => {
  await store.loadData(); 
  createScatterplot();

  // log the data
  console.log('Disasters Data:', disasters.value);
  console.log('Carbon Data:', carbon.value);
  console.log('Selected Disaster Types:', selectedDisasterTypes.value);
  console.log('Selected Countries:', selectedCountries.value);
});

watch([svgWidth, svgHeight, selectedDisasterTypes, highlightedCountries, normalizeData], () => {
  console.log('Watch triggered: Selected Disaster Types, Selected Countries, or Normalize Data changed');
  d3.select(chart.value).select('svg').remove(); 
  createScatterplot();
}, { deep: true });
</script>

<style scoped>
.scatterplot {
  width: 100%;
  height: 100%;
}
</style>