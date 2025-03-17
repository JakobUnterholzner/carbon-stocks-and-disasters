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
const disasters = computed(() => store.disastersByCountry);
const carbon = computed(() => store.carbonByCountry); // Use the carbon data to get the land area
const selectedDisasterTypes = computed(() => store.selectedDisasterTypes);
const selectedCountries = computed(() => store.selectedCountries);
const highlightedCountries = computed(() => store.highlightedCountries);
const mouseOverCountry = computed(() => store.mouseOverCountry);
const normalizeData = computed(() => store.normalizeData); 

// Reactive variables
const svgWidth = ref(600);
const svgHeight = ref(600);
const svgPadding = { top: 30, right: 20, bottom: 50, left: 50 };
const chart = ref(null); // Initialize chart reference

const createBarChart = () => {
  const svg = d3.select(chart.value)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${svgWidth.value} ${svgHeight.value}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  ////////////////////////////////////////////////////////////////////////////////////////////////////
  // DATA TRANSFORMATION AND FILTERING ///////////////////////////////////////////////////////////////
  // Filter out "All Countries and International Organizations" and transform the data for stacking
  let transformedData = disasters.value
    .filter(countryData => countryData.ISO3 !== "ACQ")
    .map(countryData => {
      const result = { ISO3: countryData.ISO3 };
      countryData.disasters.forEach(disaster => {
        result[disaster.type] = disaster.yearlyValues.reduce((acc, val) => acc + (val.value || 0), 0); // Sum of yearly values
      });

      // Normalize the disaster values by the land area if normalization is enabled
      if (normalizeData.value) {
        const carbonCountry = carbon.value.find(c => c.ISO3 === countryData.ISO3);
        const landArea = carbonCountry ? carbonCountry.carbon.find(c => c.type === 'Land area')?.yearlyValues.find(value => !isNaN(value.value))?.value : null;
        if (landArea === null || landArea === undefined || landArea === 0) {
          console.warn(`Land Area is missing or zero for country: ${countryData.ISO3}`);
          return null; // Skip this country if land area is missing or zero
        }
        Object.keys(result).forEach(key => {
          if (key !== 'ISO3') {
            result[key] = result[key]*100 / landArea;
          }
        });
      }

      return result;
    }).filter(d => d !== null); // Filter out null values


  // Filter Data based on highlightedCountries if not empty
  if (highlightedCountries.value && highlightedCountries.value.length > 0) {
    transformedData = transformedData.filter(d => highlightedCountries.value.includes(d.ISO3));
  }
    // Filter Data based on selectedCountries if not empty
  else if (selectedCountries.value && selectedCountries.value.length > 0) {
    transformedData = transformedData.filter(d => selectedCountries.value.includes(d.ISO3));
    
  }

  // Filter the disaster types based on the selected types
  const disasterTypes = [
    'Flood', // Blue
    'Drought', // Orange
    'Landslide', // Green
    'Extreme temperature', // Red
    'Storm', // Purple
    'Wildfire' // Brown
  ];  
  const filteredDisasterTypes = disasterTypes.filter(type => selectedDisasterTypes.value.includes(type));
  
  // Sort the data based on the sum of selected disaster types
  transformedData = transformedData.sort((a, b) => {
    const sumA = filteredDisasterTypes.reduce((acc, type) => acc + (a[type] || 0), 0);
    const sumB = filteredDisasterTypes.reduce((acc, type) => acc + (b[type] || 0), 0);
    return sumB - sumA;
  });

  // Stack the data
  const stack = d3.stack()
    .keys(filteredDisasterTypes)
    .order(d3.stackOrderNone)
    .offset(d3.stackOffsetNone);
  const stackedData = stack(transformedData);

  ////////////////////////////////////////////////////////////////////////////////////////////////////
  // CHART CREATION /////////////////////////////////////////////////////////////////////////////////
  // Define scales
  const yScale = d3.scaleBand()
    .domain(transformedData.map(d => d.ISO3))
    .range([svgPadding.top, svgHeight.value - svgPadding.bottom])
    .padding(0.1);

  const maxDisasterValue = d3.max(transformedData, d => d3.sum(Object.entries(d).filter(([key, value]) => key !== 'TOTAL' && typeof value === 'number').map(([key, value]) => value)));
  const xScale = d3.scaleLinear()
    .domain([0, maxDisasterValue])
    .nice()
    .range([svgPadding.left, svgWidth.value - svgPadding.right]);

  const colorScale = d3.scaleOrdinal()
    .domain(disasterTypes)
    .range(d3.schemeSet2.slice(2));

  // Get the actual width of the SVG element
  const svgElement = svg.node();
  const actualWidth = svgElement.getBoundingClientRect().width;

  // Append title to the SVG container
  svg.append('text')
    .attr('x', actualWidth / 2)
    .attr('y', svgPadding.top / 2) //
    .attr('text-anchor', 'middle') 
    .style('font-size', '18px')
    .style('font-weight', 'bold')
    .text('Number of Disasters by Country (1980-2023)');

  // Create bars
  svg.selectAll('g')
    .data(stackedData)
    .enter()
    .append('g')
    .attr('fill', d => colorScale(d.key))
    .attr('opacity', 0.8)
    .selectAll('rect')
    .data(d => d)
    .enter()
    .append('rect')
    .attr('y', d => yScale(d.data.ISO3))
    .attr('x', d => xScale(d[0]))
    .attr('height', yScale.bandwidth())
    .attr('width', d => xScale(d[1]) - xScale(d[0]))
    .on('click', function(event, d) {
      event.stopPropagation(); 
      if (highlightedCountries.value.includes(d.data.ISO3)) {
        store.removeHighlightedCountry(d.data.ISO3);
      } else {
        store.addHighlightedCountry(d.data.ISO3); 
      }
    });

  // Add small black dots over the top of the bars for highlighted countries
  const highlightedDots = svg.selectAll('.highlighted-dot')
    .data(transformedData.filter(d => highlightedCountries.value.includes(d.ISO3)));

  highlightedDots.enter()
    .append('circle')
    .attr('class', 'highlighted-dot')
    .attr('cx', svgWidth.value - svgPadding.right + 5)
    .attr('cy', d => yScale(d.ISO3) + yScale.bandwidth() / 2)
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
    .attr('cx', svgWidth.value - svgPadding.right + 5) 
    .attr('cy', d => yScale(d.ISO3) + yScale.bandwidth() / 2)
    .attr('r', 5)
    .attr('fill', 'white')
    .attr('stroke', 'black');
  mouseOverDots.exit().remove();

  // Add Y axis
  svg.append('g')
    .attr('transform', `translate(${svgPadding.left},0)`)
    .call(d3.axisLeft(yScale).tickFormat(transformedData.length < 50 ? d => d : ''))
    .selectAll('text')
    .style('font-size', '14px');
  
  // Add X axis
  svg.append('g')
    .attr('transform', `translate(0,${svgHeight.value - svgPadding.bottom})`)
    .call(d3.axisBottom(xScale))
    .selectAll('text')
    .style('font-size', '16px');

  // Add X axis label
  svg.append('text')
    .attr('class', 'x-axis-label')
    .attr('text-anchor', 'end')
    .attr('x', svgWidth.value - svgPadding.right)
    .attr('y', svgHeight.value - 10)
    .attr('font-size', '18px')
    .text(normalizeData.value ? 'Disasters / km²' : 'Disasters');
};

// Load data when component is mounted
onMounted(async () => {
  await store.loadData(); // Ensure data is loaded before creating the chart
  createBarChart();

  // log the data
  // console.log('Disasters Data:', disasters.value);
  // console.log('Carbon Data:', carbon.value);
  // console.log('Selected Disaster Types:', selectedDisasterTypes.value);
  // console.log('Selected Countries:', selectedCountries.value);
  // console.log('Highlighted Countries:', highlightedCountries.value);
  // console.log('Mouse', mouseOverCountry.value);
});

// Watch for changes in svgWidth, svgHeight, selectedDisasterTypes, selectedCountries, and normalizeData and update the chart
watch([svgWidth, svgHeight, selectedDisasterTypes, selectedCountries, highlightedCountries, mouseOverCountry, normalizeData], () => {
  console.log('Watch triggered: Selected Disaster Types, Selected Countries, or Normalize Data changed');
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