/*global CallPower, Backbone */

(function () {
    CallPower.Models.Schedule = Backbone.Model.extend({
    defaults: {
      id: null,
      created_at: null,
      phone_number: null,
      time_to_call: null,
      last_called: null,
      num_calls: null
    },
  });

  CallPower.Collections.ScheduleList = Backbone.PageableCollection.extend({
    model: CallPower.Models.Schedule,
    url: '/api/schedule',
    // turn off PageableCollection queryParams by setting to null
    // per https://github.com/backbone-paginator/backbone.paginator/issues/240
    queryParams: {
      pageSize: null,
      currentPage: "page",
      totalRecords: null,
      totalPages: null,
    },
    state: {
      firstPage: 1,
      pageSize: 10,
      sortKey: "last_called",
      direction: -1,
    },

    initialize: function(campaign_id) {
      this.campaign_id = campaign_id;
    },

    parseRecords: function(response) {
      return response.objects;
    },

    parseState: function (resp, queryParams, state, options) {
      return {
        currentPage: resp.page,
        totalRecords: resp.num_results
      };
    },

    fetch: function() {
      // transform filters and pagination to flask-restless style
      // always include campaign_id filter
      var filters = [{name: 'campaign_id', op: 'eq', val: this.campaign_id}];
      if (this.filters) {
        Array.prototype.push.apply(filters, this.filters);
      }
      // calculate offset from currentPage * pageSize, accounting for 1-base
      var currentOffset = Math.max(this.state.currentPage*-1, 0) * this.state.pageSize;
      var flaskQuery = {
        filters: filters,
        offset: currentOffset,
        order_by: [{
          field: this.state.sortKey,
          direction: this.state.direction == -1 ? "asc" : "desc"
        }]
      };
      var fetchOptions = _.extend({ data: {
        q: JSON.stringify(flaskQuery)
      }});
      return Backbone.PageableCollection.prototype.fetch.call(this, fetchOptions);
    }
  });

  CallPower.Views.ScheduleItemView = Backbone.View.extend({
    tagName: 'tr',

    initialize: function() {
      this.template = _.template($('#schedule-log-tmpl').html(), { 'variable': 'data' });
    },

    render: function() {
      var data = this.model.toJSON();
      var html = this.template(data);
      this.$el.html(html);
      return this;
    },
  });

  CallPower.Views.ScheduleLog = Backbone.View.extend({
    el: $('#schedule_log'),
    el_paginator: $('#schedule-list-paginator'),

    events: {
      'change .filters input': 'updateFilters',
      'change .filters select': 'updateFilters',
      'submit form.schedule-delete': 'unsubscribeSchedule',
    },


    initialize: function(campaign_id) {
      this.collection = new CallPower.Collections.ScheduleList(campaign_id);
      this.listenTo(this.collection, 'reset add remove', this.renderCollection);
      this.views = [];

      this.$el.find('.input-daterange input').each(function (){
        $(this).datepicker({
          'format': "yyyy/mm/dd",
          'orientation': 'top',
        });
      });

      this.updateFilters();
    },

    pagingatorPage: function(event, num){
      this.collection.getPage(num);
    },

    updateFilters: function(event) {
      var subscribed = $('select[name="subscribed"]').val();
      var start = new Date($('input[name="start"]').datepicker('getDate'));
      var end = new Date($('input[name="end"]').datepicker('getDate'));

      if (start > end) {
        $('.input-daterange input[name="start"]').addClass('error');
        return false;
      } else {
        $('.input-daterange input').removeClass('error');
      }

      var filters = [];
      if (subscribed) {
        filters.push({'name': 'subscribed', 'op': 'eq', 'val': subscribed});
      }
      if (start) {
        filters.push({'name': 'last_called', 'op': 'gt', 'val': start.toISOString()});
      }
      if (end) {
        filters.push({'name': 'last_called', 'op': 'lt', 'val': end.toISOString()});
      }

      var search_phone = $('input[name="call-search"]').val().replace('-','');
      if (search_phone) {
        filters.push({'name': 'phone_number', 'op': 'eq', 'val': search_phone});
      }

      this.collection.filters = filters;

      var self = this;
      this.collection.fetch().then(function() {
        // reset paginator with new results
        self.el_paginator.bootpag({
          total: self.collection.state.totalPages,
          page: self.collection.state.currentPage,
          maxVisible: 5,
        }).on('page', _.bind(self.pagingatorPage, self));
      });
    },

    renderCollection: function() {
      var self = this;

      // clear any existing subviews
      this.destroyViews();
      var $list = this.$('table tbody').empty();

      // create subviews for each item in collection
      this.views = this.collection.map(this.createItemView, this);
      $list.append( _.map(this.views,
        function(view) { return view.render(self.campaign_id).el; },
        this)
      );

      var renderedItems = this.$('table tbody tr');
      if (renderedItems.length === 0) {
        this.$('table tbody').html('<p>No results. Try adjusting filters.</p>');
      }
    },

    destroyViews: function() {
      // destroy each subview
      _.invoke(this.views, 'destroy');
      this.views.length = 0;
    },

    createItemView: function (model) {
      return new CallPower.Views.ScheduleItemView({ model: model });
    },

    unsubscribeSchedule: function(event) {
      event.preventDefault();
      var form = $(event.target);
      if (form.hasClass('disabled')) {
        return false;
      }

      $.ajax({
        url: form.attr('action'),
        method: form.attr('method'),
        success: function(response) {
          if (response.status == 'deleted') {
            // put it in the right table cell, disable the button
            $(form).addClass('disabled');
            var button = $(form).find('button[type="submit"]');
            button.addClass('disabled');
            button.text('Unsubscribed');
            button.removeClass('btn-danger');
          };
        },
        error: function(response) {
          console.error('unable to delete');
        }
      });
    }


  });

/*  
  CallPower.Views.ScheduleInfoView = Backbone.View.extend({
    tagName: 'div',
    className: 'microphone modal fade',

    initialize: function(data) {
      this.data = data;
      this.template = _.template($('#schedule-info-tmpl').html(), { 'variable': 'data' });
    },

    render: function() {
      var html = this.template(this.data);
      this.$el.html(html);

      this.$el.on('hidden.bs.modal', this.destroy);
      this.$el.modal('show');

      return this;
    },

    destroy: function() {
      this.undelegateEvents();
      this.$el.removeData().unbind();

      this.remove();
      Backbone.View.prototype.remove.call(this);
    },
  });
*/

})();