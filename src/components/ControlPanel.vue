<template>
    <div class="search-container">
        <input type="text" v-model="searchQuery" @input="searchCountry" placeholder="Search for a country (ISO3)" class="search-input" />
        <div v-if="searchFeedback" class="search-feedback">{{ searchFeedback }}</div>
    </div>
    <div class="normalize-container" @mouseover="showNormalizeTooltip" @mouseout="hideNormalizeTooltip" @mousemove="moveNormalizeTooltip">
        <input type="checkbox" v-model="normalizeData" @change="toggleNormalize" id="normalize-checkbox" />
        <label for="normalize-checkbox" class="normalize-label">Normalize Data</label>
        <div class="custom-tooltip" v-show="tooltipVisible" :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }">{{ tooltipText }}</div>
    </div>
    <div class="legend-container">
        <div class = "legend-disasters"></div>
        <div class = "legend-size"></div>
    </div>
    <div class="data-sources-container">
        <div class="data-sources-title">Data Sources:</div>
        <div class="data-sources"></div>
    </div>
  </template>


<script setup>
import { ref, onMounted } from 'vue';
import { useStore } from '@/stores/store.js';
import * as d3 from 'd3';

const store = useStore();
const svgWidth = ref(400);
const svgHeight = ref(400); 
const searchQuery = ref(''); // Search query for filtering countries
const searchFeedback = ref('Search a ISO3 Country Code.'); // Feedback message for search
const normalizeData = ref(false); // Normalize data flag
const tooltipVisible = ref(false); // Tooltip visibility flag
const tooltipText = ref(''); // Tooltip text
const tooltipX = ref(0); // Tooltip x position
const tooltipY = ref(0); // Tooltip y position
const disasterTypes = [
  'Flood', // Blue
  'Drought', // Orange
  'Landslide', // Green
  'Extreme temperature', // Red
  'Storm', // Purple
  'Wildfire' // Brown
];
const colorScale = d3.scaleOrdinal()
  .domain(disasterTypes)
  .range(d3.schemeSet2.slice(2));

const toggleNormalize = () => {
  store.toggleNormalizeData();
};

const showNormalizeTooltip = () => {
  tooltipText.value = 'This checkbox normalizes the data to a per square kilometer unit. By dividing the absolute values with the country size, this highlights countries that are relatively most affected or storing most carbon per square kilometer.';
  tooltipVisible.value = true;
};

const hideNormalizeTooltip = () => {
  tooltipVisible.value = false;
};

const moveNormalizeTooltip = (event) => {
  tooltipX.value = event.pageX + 10;
  tooltipY.value = event.pageY - 28;
};

const showSizeLegendTooltip = () => {
  tooltipVisible.value = true;
  tooltipText.value = 'Note that the circle size is not reflecting the true country size! The country size is encoded using a square root scale, which aims to provide a visual representation of the relative size of countries. Please hover the Scatterpoints to see the actual country size.';
};

const hideSizeLegendTooltip = () => {
  tooltipVisible.value = false;
};

const moveSizeLegendTooltip = (event) => {
  tooltipX.value = event.pageX + 10;
  tooltipY.value = event.pageY - 28;
};

const searchCountry = () => {
  if (searchQuery.value.length < 3) {
    searchFeedback.value = 'Please enter 3 letters.';
    return;
  }

  if (!store.carbon) {
    console.error('Countries data is not loaded yet.');
    searchFeedback.value = 'Countries data is not loaded yet.';
    return;
  }

  const query = searchQuery.value.toUpperCase();
  const filteredCountries = store.carbon.filter(country => country.ISO3.includes(query));
  const uniqueCountries = Array.from(new Set(filteredCountries.map(country => country.ISO3)));
  if (uniqueCountries.length > 0) {
    store.addHighlightedCountry(uniqueCountries[0]);
    searchFeedback.value = `Found ${uniqueCountries.length} country.`;
  } else {
    searchFeedback.value = 'No countries found.';
  }
};

onMounted(() => {
  // Add or update disaster legend
  const legendDisastersContainer = d3.select('.legend-disasters');
  if (legendDisastersContainer.select('svg').empty()) {
    // Create the disaster legend if it doesn't exist
    const legend = legendDisastersContainer
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%') // Adjust height based on content
      .attr('preserveAspectRatio', 'xMidYMid meet');

    disasterTypes.forEach((type, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 20})`)
        .style('cursor', 'pointer')
        .on('click', () => {
          store.toggleDisasterType(type);
          updateLegend();
          d3.select(chart.value).select('svg').remove();
          createTimeSeriesChart();
        });

      legendRow.append('rect')
        .attr('width', 17)
        .attr('height', 17)
        .attr('fill', colorScale(type))
        .attr('class', `legend-rect-${type}`);

      legendRow.append('text')
        .attr('x', 30)
        .attr('y', 15)
        .attr('text-anchor', 'start')
        .style('font-size', '18px')
        .attr('class', `legend-text-${type}`)
        .text(type);
    });
  }

  // Add or update size legend
  const legendSizeContainer = d3.select('.legend-size');
  if (legendSizeContainer.select('div').empty()) {
    // Create the size legend if it doesn't exist
    const sizeLegend = legendSizeContainer
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .on('mouseover', showSizeLegendTooltip)
      .on('mouseout', hideSizeLegendTooltip)
      .on('mousemove', moveSizeLegendTooltip);

    // Append title for size legend
    sizeLegend.append('text')
        .attr('class', 'size-legend-title')
        .text('Country Size')
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .style('text-align', 'left');

    // Define size examples
    const min = 1000;
    const max = 1000000;
    const sizeScale = d3.scaleSqrt()
      .domain([min, max]) // 1000 HA unit -> domain(10.000km², 1.000.000km²)
      .range([5, 30]);

    const sizeExamples = [
      { label: '10.000km² or less :', size: sizeScale(min) }, // min domain
      { label: '1.000.000km² or more :', size: sizeScale(max) } // max domain
    ];

    // Append circles and text for size legend
    sizeExamples.forEach(example => {
    const legendItem = legendSizeContainer.append('div')
        .attr('class', 'size-legend-item')
        .style('display', 'flex')
        .style('margin-bottom', '10px');
    
    legendItem.append('div')
        .attr('class', 'size-legend-label')
        .style('font-size', '16px')
        .text(example.label);

    legendItem.append('div')
        .attr('class', 'size-legend-circle')
        .style('width', `${example.size * 2}px`)
        .style('height', `${example.size * 2}px`)
        .style('background-color', 'gray')
        .style('border', '1px solid black')
        .style('border-radius', '50%')
        .style('margin-left', example.size > 15 ? '5px' : '40px') // Conditional margin
        .style('margin-top', `-${example.size}px`)
        .style('margin-bottom', `-${example.size}px`)
        .style('opacity', 0.8)
        .style('flex-shrink', '0'); // Prevent shrinking

    });
  }


    // Add introductory text for data sources
    const dataSourcesContainer = d3.select('.data-sources');
    const dataSources = [
        { text: 'Climate-related Disasters Frequency', url: 'https://climatedata.imf.org/datasets/b13b69ee0dde43a99c811f592af4e821/explore'},
        { text: 'Forest and Carbon', url: 'https://climatedata.imf.org/datasets/66dad9817da847b385d3b2323ce1be57/explore' }
    ];

    dataSources.forEach((source) => {
        const link = dataSourcesContainer.append('a')
        .attr('class', 'data-source-link')
        .attr('href', source.url)
        .attr('target', '_blank')
        .text(source.text)
        .append('br')
        .attr('class', 'data-source-link')
        .attr('text-align', 'left')
        .attr('font-size', '16px')
    });


  function updateLegend() {
    disasterTypes.forEach((type) => {
      d3.select(`.legend-rect-${type}`)
        .attr('opacity', store.selectedDisasterTypes.includes(type) ? 1 : 0.3);

      d3.select(`.legend-text-${type}`)
        .attr('opacity', store.selectedDisasterTypes.includes(type) ? 1 : 0.3);
    });
  }
});
</script>
<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between; 
  height: 100%;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 5px;
  box-sizing: border-box;
}

.search-container {
  margin-bottom: 10px;
  width: 100%; 
}

.search-input {
  width: 100%; 
  padding: 1px;
  font-size: 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box; 
}

.search-feedback {
  font-size: 16px;
}

.normalize-container {
  display: flex;
  align-items: center;
  margin-top: 5px;
  margin-bottom: 5px;
}

#normalize-checkbox {
  margin-right: 10px;
  transform: scale(1.5);
  margin-bottom: 5px;
}

.normalize-label {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 10px;
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
  font-size: 16px;
  z-index: 100;
  box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.2s;
}

.custom-tooltip[v-show="true"] {
  opacity: 1;
}

.legend-container {
  display: flex; 
  margin-top: 5px;
  margin-bottom: 50px;
  width: 100%; 
  height: 40%;
}

.legend-disasters, .legend-size {
  flex: 1; 
  display: flex;
  flex-direction: column;
  justify-content: center; 
  align-items: center;
}

.data-sources-container {
  margin-top: 2px; 
  width: 100%; 
}

.data-sources-title {
  font-size: 16px;
  margin-top: 2px;
  font-weight: bold;
  text-align: left;
}

.data-sources {
  font-size: 16px;
  text-align: left;
  color: blue;
  text-decoration: underline;
  
}
</style>