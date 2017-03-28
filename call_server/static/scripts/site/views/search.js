/*global CallPower, Backbone */

(function () {
  CallPower.Views.TargetSearch = Backbone.View.extend({
    el: $('div#target-search'),

    events: {
      // target search
      'keydown input[name="target-search"]': 'searchKey',
      'focusout input[name="target-search"]': 'searchTab',
      'click .search-field .dropdown-menu li a': 'searchField',
      'click .search': 'doTargetSearch',
      'click .search-results .result': 'selectSearchResult',
      'click .search-results .close': 'closeSearch',
    },

    initialize: function() { },

    searchKey: function(event) {
      if(event.which === 13) { // enter key
        event.preventDefault();
        this.doTargetSearch();
      }
    },

    searchTab: function(event) {
      // TODO, if there's only one result add it
      // otherwise, let user select one
    },

    searchField: function(event) {
      event.preventDefault();
      var selectedField = $(event.currentTarget);
      $('.search-field button').html(selectedField.text()+' <span class="caret"></span>');
      $('input[name=search_field]').val(selectedField.attr('id'));
    },

    doTargetSearch: function(event) {
      var self = this;

      var campaign_country = $('select[name="campaign_country"]').val();
      var campaign_type = $('select[name="campaign_type"]').val();
      var campaign_state = $('select[name="campaign_state"]').val();
      var search_field = $('input[name=search_field]').val();

      // search the political data cache by default
      var query = $('input[name="target-search"]').val();
      var searchURL = '/political_data/search';
      var searchData = {
        'country': campaign_country,
        'key': query // default to full text search
      };

      if (!search_field) {
        self.errorSearchResults({status: 'warning', message: 'Select a field to search'});
        return false;
      }

      if (query.length < 2) {
        self.errorSearchResults({status: 'warning', message: 'Search query must be at least two characters long'});
        return false;
      }

      if (campaign_country === 'us') {
        var chamber = $('select[name="campaign_subtype"]').val();

        if (search_field === 'state') {
          query = query.toUpperCase();
          if (query.length > 2) {
            self.errorSearchResults({status: 'danger', message: 'Search by state abbreviation'});
            return false;
          }
        }

        if (search_field === 'last_name') {
          searchData['filter'] = 'last_name='+query;
          query = ''; // clear query, used as filter value
        }

        if (campaign_type === 'congress') {
          // format key by chamber
          if (chamber === 'lower') {
              searchData['key'] = 'us:house:'+query;
          }
          if (chamber === 'upper') {
            searchData['key'] = 'us:senate:'+query;
          }
          if (chamber === 'both') {
            // use jQuery param to send multiple values
            var filter = searchData['filter'];
            searchData = $.param({
              'key': ['us:house:'+query, 'us:senate:'+query],
              'filter': filter
            }, true);
          }
        }

        if (campaign_type === 'state') {
          if (chamber === 'exec') {
            // search using our own data
            searchData['key'] = 'us_state:governor:'+query;
          } else {
            // hit OpenStates
            searchURL = CallPower.Config.SUNLIGHT_STATES_URL;
            searchData = {
              apikey: CallPower.Config.SUNLIGHT_API_KEY,
              state: campaign_state,
            }
            if (chamber === 'upper' || chamber === 'lower') {
              searchData['chamber'] = chamber;
            } // if both, don't limit to a chamber
            // query may have been cleared, get value from input
            searchData[search_field] = $('input[name="target-search"]').val();
          }
        }
      }

      if (campaign_country === 'ca') {
        var baseURL = CallPower.Config.OPENNORTH_URL;
        // reset search data to match OpenNorth
        searchData = {};
        
        if (campaign_type === 'parliament') {
          searchURL = baseURL + 'representatives/house-of-commons/';
          searchData[search_field] = query;
        }

        if (campaign_type === 'province') {
          var CA_PROVINCE_BODIES = {
            'AB': 'alberta-legislature',
            'BC': 'bc-legislature',
            'MB': 'manitoba-legislature',
            'NB': 'new-brunswick-legislature',
            'NL': 'newfoundland-labrador-legislature',
            'NS': 'nova-scotia-legislature',
            'ON': 'ontario-legislature',
            'PE': 'pei-legislature',
            'QC': 'quebec-assemblee-nationale',
            'SK': 'saskatchewan-legislature',
           }
          searchURL = baseURL + 'representatives/'+CA_PROVINCE_BODIES[campaign_state];
          searchData[search_field] = query;
        }
      }

      $.ajax({
        url: searchURL,
        data: searchData,
        success: self.renderSearchResults,
        error: self.errorSearchResults,
        beforeSend: function(jqXHR, settings) { console.log(settings.url); },
      });

      // start spinner
      $('.btn.search .spin').css('display', 'inline-block');
      $('.btn.search .text').hide();
      $('.btn.search').attr('disabled','disabled');
      return true;
    },

    renderSearchResults: function(response) {
      // stop spinner
      $('#target-search .glyphicon.spin').hide();
      $('.btn.search .text').show();
      $('.btn.search').removeAttr('disabled');

      // clear existing results, errors
      $('.search-results .dropdown-menu').empty();
      $('.form-group#set-targets .search-help-block').empty();

      var results;
      if (response.results) {
        results = response.results;
      } if (response.objects) {
        // open north returns meta
        results = response.objects;
      }

      if (!results) {
        results = response;
      }

      var dropdownMenu = renderTemplate("#search-results-dropdown-tmpl");
      if (results.length === 0) {
        dropdownMenu.append('<li class="result close"><a>No results</a></li>');
      }

      _.each(results, function(person) {
        // standardize office titles
        if (person.title === 'Sen')  { person.title = 'Senator'; }
        if (person.title === 'Rep')  { person.title = 'Representative'; }
        if (person.elected_office === 'MP')  { person.title = 'MP'; }

        if (person.bioguide_id) {
          person.uid = 'us:bioguide:'+person.bioguide_id;
        } else if (person.leg_id) {
          person.uid = 'us_state:openstates:'+person.leg_id;
        } else if (person.title === 'Governor') {
          person.uid = 'us_state:governor:'+person.state
        } else if (person.related && person.related.boundary_url) {
          var boundary_url = person.related.boundary_url.replace('/boundaries/', '/');
          person.uid = boundary_url;
        }

        // render the main office
        if (person.phone || person.tel) {
          var li = renderTemplate("#search-results-item-tmpl", person);
          dropdownMenu.append(li);
        }

        // then any others
        _.each(person.offices, function(office) {
          if (office.phone || office.tel) {
            person.phone = office.phone || office.tel;
            person.office_name = office.name || office.city || office.type;
            var li = renderTemplate("#search-results-item-tmpl", person);
            dropdownMenu.append(li);
          }
        });
      });
      $('.input-group .search-results').append(dropdownMenu);
    },

    errorSearchResults: function(response) {
      var error_panel = $('<div class="alert alert-'+response.status+'">'+
                          '<button type="button" class="close" data-dismiss="alert">×</button>'+
                          response.message+'</div>');
      $('.form-group#set-targets .search-help-block').html(error_panel);
    },

    closeSearch: function() {
      var dropdownMenu = $('.search-results .dropdown-menu').remove();
    },

    selectSearchResult: function(event) {
      // pull json data out of data-object attr
      var obj = $(event.target).data('object');
      
      // add it to the targetListView collection
      CallPower.campaignForm.targetListView.collection.add(obj);

      // if only one result, closeSearch
      if ($('.search-results .dropdown-menu').children('.result').length <= 1) {
        this.closeSearch();
      }
    },

  });

})();