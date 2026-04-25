<script setup lang="ts">
import DisplayVariable from "../DisplayVariable.vue";
</script>

<template>
  <div>Date variables support additional modifications.</div>
  <h4>Changing date format</h4>
  <p>
    By default date variables are formatted using Default date format defined in journal settings. However you can
    override it on variable level by adding colon and putting format definition after it.
  </p>
  <p>For example <DisplayVariable name="date:YYYY" /> will output only year.</p>
  <p><a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">Formatting reference.</a></p>
  <h4>Date manipulation</h4>
  <p>
    You can add or subtract some number of days, weeks, months, quarters or years to date variable by adding
    <code>+</code> or <code>-</code> and unit after name variable.
  </p>
  <p>For example <DisplayVariable name="date+1w" /> will add 1 week to date.</p>
  <p>Supported units are:</p>
  <ul>
    <li><code>d</code>: days</li>
    <li><code>w</code>: weeks</li>
    <li><code>m</code>: month</li>
    <li><code>q</code>: quarters</li>
    <li><code>y</code>: years</li>
  </ul>
  <h4>Changing date to start or end of period</h4>
  <p>
    Date can be changed to start or end of period by using <code>&lt;startOf=period&gt;</code> or
    <code>&lt;endOf=period&gt;</code>
  </p>
  <p>For example <DisplayVariable name="date<startOf=year>" /> will change date to January 1st</p>
  <p>Supported periods are:</p>
  <ul>
    <li>week</li>
    <li>month</li>
    <li>quarter</li>
    <li>year</li>
    <li>decade</li>
  </ul>
  <hr />
  <p>All modifications can be used simultaneously</p>
  <p>
    For example <DisplayVariable name="date+1w<startOf=week>:MMM DD, YYYY" /> will modify date to first date of next
    week and format it using <code>MMM DD, YYYY</code>
  </p>
</template>
