/*global CallPower, Backbone */

(function () {
  CallPower.Views.StatisticsView = Backbone.View.extend({
    el: $('#statistics'),
    campaignId: null,

    events: {
      'change select[name="campaigns"]': 'changeCampaign',
      'change select[name="timespan"]': 'renderChart',
      'click .btn.download': 'downloadTable',
    },

    initialize: function() {
      this.$el.find('.input-daterange input').each(function (){
        $(this).datepicker({
          'format': "yyyy/mm/dd"
        });
      });

      _.bindAll(this, 'renderChart');
      this.$el.on('changeDate', _.debounce(this.renderChart, this));

      this.chartOpts = {
        stacked: true,
        discrete: true,
        library: {
          canvasDimensions:{ height:250},
          xAxis: {
            type: 'datetime',
            dateTimeLabelFormats: {
                day: '%e. %b'
            }
          },
          yAxis: { allowDecimals: false, min: null },
        }
      };
      this.campaignDataTemplate = _.template($('#campaign-data-tmpl').html(), { 'variable': 'data' });
      this.targetDataTemplate = _.template($('#target-data-tmpl').html(), { 'variable': 'targets'});

      $.tablesorter.addParser({
        id: 'lastname',
        is: function(s) {
          return false;
        },
        format: function(s) {
          var parts = s.split(" ");
          return parts[1];
        },
        type: 'text'
      });

      this.renderChart();
    },

    changeCampaign: function(event) {
      var self = this;

      this.campaignId = $('select[name="campaigns"]').val();
      $.getJSON('/api/campaign/'+this.campaignId+'/stats.json',
        function(data) {
          if (data.sessions_completed && data.sessions_started) {
            var conversion_rate = (data.sessions_completed / data.sessions_started);
            conversion_pct = Number((conversion_rate*100).toFixed(2));
            data.conversion_rate = (conversion_pct+"%");
          } else {
            data.conversion_rate = 'n/a';
          }
          if (!data.sessions_completed) {
            data.calls_per_session = 'n/a';
          }
          $('#campaign_data').html(
            self.campaignDataTemplate(data)
          ).show();

          if (data.date_start && data.date_end) {
            $('input[name="start"]').datepicker('setDate', data.date_start);
            $('input[name="end"]').datepicker('setDate', data.date_end);
          }
          self.renderChart();
        });
    },

    renderChart: function(event) {
      var self = this;

      if (!this.campaignId) {
        return false;
      }

      var timespan = $('select[name="timespan"]').val();
      var start = new Date($('input[name="start"]').datepicker('getDate')).toISOString();
      var end = new Date($('input[name="end"]').datepicker('getDate')).toISOString();

      if (start > end) {
        $('.input-daterange input[name="start"]').addClass('error');
        return false;
      } else {
        $('.input-daterange input').removeClass('error');
      }

      var chartDataUrl = '/api/campaign/'+this.campaignId+'/date_calls.json?timespan='+timespan;
      if (start) {
        chartDataUrl += ('&start='+start);
      }
      if (end) {
        chartDataUrl += ('&end='+end);
      }

      $('#chart_display').html('<span class="glyphicon glyphicon-refresh spin"></span> Loading...');
      $.getJSON(chartDataUrl, function(data) {
        // api data is by date, map to series by status
        var DISPLAY_STATUS = ['completed', 'busy', 'failed', 'no-answer', 'canceled', 'unknown'];
        series = _.map(DISPLAY_STATUS, function(status) { 
          var s = _.map(data, function(value, date) {
            return [date, value[status]];
          });
          return {'name': status, 'data': s };
        });
        self.chart = new Chartkick.ColumnChart('calls_for_campaign', series, self.chartOpts);
      });

      if (this.campaignId) {
        // table data for calls per target
        var tableDataUrl = '/api/campaign/'+this.campaignId+'/target_calls.json?';
        if (start) {
          tableDataUrl += ('&start='+start);
        }
        if (end) {
          tableDataUrl += ('&end='+end);
        }

        $('table#table_data').html('<span class="glyphicon glyphicon-refresh spin"></span> Loading...');
        $('#table_display').show();
        $.getJSON(tableDataUrl).success(function(data) {
          var content = self.targetDataTemplate(data.objects);
          return $('table#table_data').html(content).promise();
        }).then(function() {
          return $('table#table_data').tablesorter({
            theme: "bootstrap",
            headerTemplate: '{content} {icon}',
            headers: {
              1: {
                sorter:'lastname'
              }
            },
            sortList: [[3,1]],
            sortInitialOrder: "asc",
            widgets: [ "uitheme", "columns", "zebra", "output"],
            widgetOptions: {
              zebra : ["even", "odd"],
              output_delivery: 'download',
              output_saveFileName: 'callpower-export.csv'
            }
          }).promise();
        }).then(function() {
          $('.btn.download').show();
          // don't know why this is necessary, but it appears to be
          setTimeout(function() {
            $('table#table_data').trigger("updateAll");
          }, 10);
        });
      } else {
        $('#table_display').hide();
      }
    },

    downloadTable: function(event) {
      console.log('download!');
      $('table#table_data').trigger('outputTable');
    },
  });
})();