<template>
  <div class="bar-chart" ref="chart"></div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from '@/stores/store.js';
import * as d3 from 'd3';

// Access the Pinia store
const store = useStore();

// Computed properties
const carbon = computed(() => store.carbonByCountry);
const selectedCountries = computed(() => store.selectedCountries);
const highlightedCountries = computed(() => store.highlightedCountries);
const mouseOverCountry = computed(() => store.mouseOverCountry);
const normalizeData = computed(() => store.normalizeData);

// Reactive variables
const svgWidth = ref(600);
const svgHeight = ref(600);
const svgPadding = { top: 30, right: 25, bottom: 50, left: 60};
const chart = ref(null);

const createBarChart = () => {
  const svg = d3.select(chart.value)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${svgWidth.value} ${svgHeight.value}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  ////////////////////////////////////////////////////////////////////////////////////////////////////
  // DATA TRANSFORMATION AND FILTERING ///////////////////////////////////////////////////////////////
  // Filter out countries that are not actual countries but groups or regions
  let filteredCarbonData = carbon.value.filter(countryData => 
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

  // Filter Data based on highlightedCountries if not empty
  if (highlightedCountries.value && highlightedCountries.value.length > 0) {
    filteredCarbonData = filteredCarbonData.filter(d => highlightedCountries.value.includes(d.ISO3));
  }
  // Filter Data based on selectedCountries if not empty
  else if (selectedCountries.value && selectedCountries.value.length > 0) {
    filteredCarbonData = filteredCarbonData.filter(d => selectedCountries.value.includes(d.ISO3));
  }

  // Transform the final carbon data for visualization
  // This function processes the carbon data for each country and calculates the mean carbon stocks and mean forest area share.
  // It also normalizes the carbon stocks by land area if normalization is enabled.
  // If the land area is missing, undefined, or zero, the country is skipped and a warning is logged.
  const transformedData = filteredCarbonData.map(countryData => {
    const carbonStocks = countryData.carbon.find(c => c.type === 'Carbon stocks');
    const forestAreaShare = countryData.carbon.find(c => c.type === 'Share of forest area');
    const landArea = countryData ? countryData.carbon.find(c => c.type === 'Land area')?.yearlyValues.find(value => !isNaN(value.value))?.value : null;
    if (landArea === null || landArea === undefined || landArea === 0) {
      console.warn(`Land Area is missing or zero for country: ${countryData.ISO3}`);
      return null; // Skip this country if land area is missing or zero
    }
    const validYearlyValues = carbonStocks ? carbonStocks.yearlyValues
    .filter(val => !isNaN(val.value))
    .filter(({ year }) => year >= 1992 && year <= 2020) // Filter data from 1992 to 2020
    : [];
    const totalYears = validYearlyValues.length;
    const meanCarbonStocks = totalYears > 0 ? validYearlyValues.reduce((acc, val) => acc + val.value, 0) / totalYears : 0;
    const meanForestAreaShare = forestAreaShare && forestAreaShare.yearlyValues.length > 0
      ? forestAreaShare.yearlyValues.reduce((acc, val) => acc + val.value, 0) / forestAreaShare.yearlyValues.length
      : 0;
    const normalizedCarbonStocks = normalizeData.value ? meanCarbonStocks * 100 / landArea : meanCarbonStocks;

      // Log values for debugging
    // console.log(`Country: ${countryData.ISO3}, Mean Carbon Stocks: ${meanCarbonStocks}, Land Area: ${landArea}, Normalized Carbon Stocks: ${normalizedCarbonStocks}`);

    return {
      ISO3: countryData.ISO3,
      normalizedCarbonStocks,
      meanForestAreaShare,
    };
  }).filter(d => d !== null); // Filter out null values

  // Log the transformed data
  console.log('Transformed Data:', transformedData);

  // Sort the data by 'normalizedCarbonStocks' value
  transformedData.sort((a, b) => a.normalizedCarbonStocks - b.normalizedCarbonStocks);


  ////////////////////////////////////////////////////////////////////////////////////////////////////
  // CREATE THE BAR CHART ////////////////////////////////////////////////////////////////////////////
  // Define scales
  const xScale = d3.scaleBand()
    .domain(transformedData.map(d => d.ISO3))
    .range([svgPadding.left, svgWidth.value - svgPadding.right])
    .padding(0.1);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(transformedData, d => d.normalizedCarbonStocks)])
    .nice()
    .range([svgHeight.value - svgPadding.bottom, svgPadding.top]);

  // Define gradients
  const defs = svg.append('defs');
  transformedData.forEach(d => {
    const gradient = defs.append('linearGradient')
      .attr('id', `gradient-${d.ISO3}`)
      .attr('x1', '0%')
      .attr('y1', '100%')
      .attr('x2', '0%')
      .attr('y2', '0%');

    gradient.append('stop')
      .attr('offset', `${d.meanForestAreaShare}%`)
      .attr('stop-color', d3.schemeCategory10[2])
      .attr('stop-opacity', 0.9);

    gradient.append('stop')
      .attr('offset', `${d.meanForestAreaShare}%`)
      .attr('stop-color', d3.schemeCategory10[0])
      .attr('stop-opacity', 0.9);
  });

  // Create bars
  svg.selectAll('rect')
    .data(transformedData)
    .enter()
    .append('rect')
    .attr('x', d => xScale(d.ISO3))
    .attr('y', d => {
      const yValue = yScale(d.normalizedCarbonStocks);
      return yValue;
    })
    .attr('width', xScale.bandwidth())
    .attr('height', d => {
      const heightValue = yScale(0) - yScale(d.normalizedCarbonStocks);
      return heightValue;
    })
    .attr('fill', d => `url(#gradient-${d.ISO3})`)
    .on('click', function(event, d) {
      event.stopPropagation();
      if (highlightedCountries.value.includes(d.ISO3)) {
        store.removeHighlightedCountry(d.ISO3); 
      } else {
        store.addHighlightedCountry(d.ISO3);
      }
    });

  // Add percentage labels inside bars
  if (transformedData.length < 20) {
    svg.selectAll('.bar-label')
      .data(transformedData)
      .enter()
      .append('text')
      .attr('class', 'bar-label')
      .attr('x', d => xScale(d.ISO3) + xScale.bandwidth() / 2)
      .attr('y', d => yScale(d.normalizedCarbonStocks * d.meanForestAreaShare / 100) - 5)
      .attr('text-anchor', 'middle')
      .attr('fill', 'white')
      .text(d => `${d.meanForestAreaShare.toFixed(0)}%`);
  }

  // Add small black dots over the top of the bars for highlighted countries
  const highlightedDots = svg.selectAll('.highlighted-dot')
    .data(transformedData.filter(d => highlightedCountries.value.includes(d.ISO3)));
  
  highlightedDots.enter()
    .append('circle')
    .attr('class', 'highlighted-dot')
    .attr('cx', d => xScale(d.ISO3) + xScale.bandwidth() / 2)
    .attr('cy', d => svgPadding.top + 5)
    .attr('r', 5)
    .attr('fill', 'black')
    .on('click', function(event, d) {
      event.stopPropagation(); 
      store.removeHighlightedCountry(d.ISO3);
    });

  highlightedDots.exit().remove();

  // Add small white dots with black borders over the top of the bars for mouse over Country
  const mouseOverDots = svg.selectAll('.mouse-over-dot')
    .data(transformedData.filter(d => mouseOverCountry.value === d.ISO3));

  mouseOverDots.enter()
    .append('circle')
    .attr('class', 'mouse-over-dot')
    .attr('cx', d => xScale(d.ISO3) + xScale.bandwidth() / 2)
    .attr('cy', d => svgPadding.top + 5)
    .attr('r', 5)
    .attr('fill', 'white')
    .attr('stroke', 'black');
  
  mouseOverDots.exit().remove();


  // Add X axis
  const xAxis = svg.append('g')
    .attr('transform', `translate(0,${svgHeight.value - svgPadding.bottom})`)
    .call(d3.axisBottom(xScale));

  // Conditionally add labels to the X-axis ticks if fewer than 60 bars are shown
  if (transformedData.length < 50) {
    xAxis.selectAll('text')
      .attr('text-anchor', 'end')
      .attr('transform', 'rotate(-45)')
      .style('font-size', '14px')
      .attr('dx', '-0.8em')
      .attr('dy', '0.15em')
      .text(d => d);
  } else {
    xAxis.selectAll('text')
      .attr('text-anchor', 'middle')
      .text('');
  }

  // Append title to the SVG container
  svg.append('text')
    .attr('y', svgPadding.top / 2) 
    .attr('x', svgPadding.left * 2)
    .attr('text-anchor', 'left')
    .style('font-size', '18px') 
    .style('font-weight', 'bold')
    .text('Mean Carbon stocks in forests by Country (1992-2020)');


  // Add Y axis
  svg.append('g')
    .attr('transform', `translate(${svgPadding.left},0)`)
    .call(d3.axisLeft(yScale))
    .selectAll('text')
    .style('font-size', '16px');

  // Add Y axis label
  svg.append('text')
    .attr('class', 'y-axis-label')
    .attr('text-anchor', 'left')
    .attr('x', svgPadding.left/ 4)
    .attr('y', svgPadding.top - 10)
    .attr('font-size', '18px')
    .text(normalizeData.value ? 'MtCO₂ / km²' : 'MtCO₂');

// Add legend for mean forest area coloring
if (transformedData.length > 4) {
  const legend = svg.append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${svgPadding.left + 5}, ${svgPadding.top})`);

  // Add rectangle for forest area portion
  legend.append('rect')
    .attr('x', 20)
    .attr('y', 0)
    .attr('width', 20)
    .attr('height', 20)
    .attr('fill', 'green');

  legend.append('text')
    .attr('x', 50)
    .attr('y', 15)
    .attr('text-anchor', 'start')
    .style('font-size', '18px')
    .text('Share of forest area (%)');

  // Add rectangle for non-forest area portion
  legend.append('rect')
    .attr('x', 20)
    .attr('y', 30)
    .attr('width', 20)
    .attr('height', 20)
    .attr('fill', 'steelblue');

  legend.append('text')
    .attr('x', 50)
    .attr('y', 45)
    .attr('text-anchor', 'start')
    .style('font-size', '18px')
    .text('Share of non forest area (%)');
  }
};


onMounted(async () => {
  await store.loadData(); // Ensure data is loaded before creating the chart
  createBarChart();

  // log the data
  console.log('Carbon Data:', carbon.value);
  console.log('Selected Countries:', selectedCountries.value);
});

// Watch for changes in svgWidth, svgHeight, selectedCountries, and normalizeData and update the chart
watch([svgWidth, svgHeight, selectedCountries, highlightedCountries, mouseOverCountry, normalizeData], () => {
  console.log('Watch triggered: Selected Countries or Normalize Data changed');
  d3.select(chart.value).select('svg').remove();
  createBarChart();
}, { deep: true });
</script>

<style scoped>
.bar-chart {
  width: 100%;
  height: 100%;
}
</style>