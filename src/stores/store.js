import { defineStore } from 'pinia';
import * as d3 from 'd3';

export const useStore = defineStore({
  id: 'main',
  state: () => ({
    disaster: [],
    carbon: [],
    selectedDisasterTypes: ['Flood', 'Drought', 'Landslide', 'Extreme temperature', 'Storm', 'Wildfire'], // Default all types
    selectedCountries: [], // Default empty list -> all countries
    highlightedCountries: [], // Default empty list -> no highlighted countries
    mouseOverCountry: '',
    normalizeData: false,
  }),
  actions: {
    async loadData() {
      const disasterData = await d3.csv('./14_Climate-related_Disasters_Frequency_total.csv');
      const carbonData = await d3.csv('./13_Forest_and_Carbon.csv');
      
      // Assign data to state after loading
      this.disaster = disasterData;
      this.carbon = carbonData;

      // Log the loaded data
      // console.log('Raw Disaster Data:', this.disaster);
      // console.log('Raw Carbon Data:', this.carbon);
    },
    toggleDisasterType(type) {
      if (this.selectedDisasterTypes.includes(type)) {
        this.selectedDisasterTypes = this.selectedDisasterTypes.filter(t => t !== type);
      } else {
        this.selectedDisasterTypes.push(type);
      }
    },
    setSelectedCountries(countries) {
      this.selectedCountries = countries;
    },
    addHighlightedCountry(country) {
      this.highlightedCountries.push(country);
    },
    removeHighlightedCountry(country) {
      this.highlightedCountries = this.highlightedCountries.filter(c => c !== country);
    },
    resetHighlightedCountries() {
      this.highlightedCountries = [];
    },
    toggleNormalizeData() {
      this.normalizeData = !this.normalizeData;
    },
    addMouseOverCountry(country) {
      this.mouseOverCountry = country;
    },
    removeMouseOverCountry() {
      this.mouseOverCountry = '';
    },
  },
  getters: {
    disastersByCountry(state) {
      if (!state.disaster.length) return []; // Guard clause to handle undefined

      // Group data by country
      const groupedData = d3.group(state.disaster, d => d.Country);
      
      // This function processes the grouped data by country and maps it to an array of objects.
      // Each object represents a country and contains its ISO3 code and an array of disaster-related data defined by the disasterTypes array.
      // For each type, it extracts yearly values, converting them from strings to numbers.
      // If a type is not found for a country, it initializes it with an empty array of yearly values.
      return Array.from(groupedData, ([country, values]) => {
        const disasterTypes = ['Drought', 'Extreme temperature', 'Flood', 'Landslide', 'Storm', 'TOTAL', 'Wildfire'];
        const disasters = disasterTypes.map(type => {
          const disaster = values.find(d => d.Indicator.includes(type));
          if (disaster) {
            const yearlyValues = Object.keys(disaster)
              .filter(key => !['Country', 'ISO2', 'ISO3', 'Indicator', 'Unit', 'Source'].includes(key))
              .map(year => ({
                year: +year,
                value: +disaster[year] || 0,
              }));
            return {
              type,
              yearlyValues,
            };
          } else {
            return {
              type,
              yearlyValues: [],
            };
          }
        });
        return {
          country,
          ISO3: values[0].ISO3,
          disasters,
        };
      });
    },
    carbonByCountry(state) {
      if (!state.carbon.length) return []; // Guard clause to handle undefined

      // Group data by country
      const groupedData = d3.group(state.carbon, d => d.Country);

      // This function processes the grouped data by country and maps it to an array of objects.
      // Each object represents a country and contains its ISO3 code and an array of carbon-related data defined by the carbonTypes array.
      // For each type, it extracts yearly values, converting them from strings to numbers.
      // If a type is not found for a country, it initializes it with an empty array of yearly values.
      return Array.from(groupedData, ([country, values]) => {
        const carbonTypes = ['Carbon stocks', 'Forest area', 'Index of carbon stocks in forests', 'Index of forest extent', 'Land area', 'Share of forest area'];        
        const carbon = carbonTypes.map(type => {
          const carbon = values.find(d => d.Indicator.includes(type));
          if (carbon) {
            const yearlyValues = Object.keys(carbon)
              .filter(key => !['Country', 'ISO2', 'ISO3'].includes(key))
              .map(year => ({
                year: +year,
                value: +carbon[year] || 0,
              }));
            return {
              type,
              yearlyValues,
            };
          } else {
            return {
              type,
              yearlyValues: [],
            };
          }
        });
        return {
          country,
          ISO3: values[0].ISO3,
          carbon,
        };
      });
    },
  },
});