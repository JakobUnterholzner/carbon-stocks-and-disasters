<template>
  <div id="app">    
    <header>
      <h1>Climate-related Disasters and Carbon Stocks</h1>
    </header>
    <div class="container-fluid">
      <div class="row">
        <div class="col-md-4 view">
          <BarChartDisasters/>
        </div>
        <div class="col-md-4 view">
          <Scatterplot />
        </div>
        <div class="col-md-4 view">
          <BarChartForest/>
        </div>
      </div>
      <div class="row">
        <div class="control-panel">
          <ControlPanel/>
        </div>
        <div class="col-md-8 view">
          <TimeSeriesChart/>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useStore } from '@/stores/store.js';

// Initialize store
const store = useStore();

// Import components
import BarChartDisasters from '@/components/BarChartDisasters.vue';
import BarChartForest from '@/components/BarChartForest.vue';
import Scatterplot from '@/components/Scatterplot.vue';
import TimeSeriesChart from '@/components/TimeSeries.vue';
import ControlPanel from '@/components/ControlPanel.vue';

// Load data when component is mounted
onMounted(() => {
  store.loadData();
});
</script>

<style scoped>
#app {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  min-height: 100vh;
  text-align: center;
}

header {
  width: 100%;
  text-align: center;
}

.container-fluid {
  width: 100%;
}

.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 5px;
}


.col-md-4 {
  flex: 1;
  margin: 10px;
  max-width: calc(33.333% - 20px);
  height: 60vh;
}

.col-md-8 {
  flex: 1;
  margin: 10px;
  max-width: calc(66.666% - 20px);
  height: 35vh;
}

.control-panel {
  flex: 1;
  margin: 10px;
  max-width: calc(33.333% - 20px);
  height: 35vh;
  background-color: /* light grey */ #f9f9f9;
  border-radius: 5px;
  padding: 10px;
  border-color: black;
}

.view {
  background-color: #e6e6fa; /* Lavender */
  padding: 10px;
  border-radius: 5px;
}
</style>