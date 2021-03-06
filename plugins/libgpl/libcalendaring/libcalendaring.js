/**
 * Basic Javascript utilities for calendar-related plugins
 *
 * @version @package_version@
 * @author Thomas Bruederli <bruederli@kolabsys.com>
 *
 * Copyright (C) 2012, Kolab Systems AG <contact@kolabsys.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

function rcube_libcalendaring(settings)
{
    // member vars
    this.settings = settings;
    this.alarm_ids = [];
    this.alarm_dialog = null;
    this.snooze_popup = null;
    this.dismiss_link = null;

    // private vars
    var me = this;
    var gmt_offset = (new Date().getTimezoneOffset() / -60) - (settings.timezone || 0) - (settings.dst || 0);
    var client_timezone = new Date().getTimezoneOffset();

    // general datepicker settings
    var datepicker_settings = {
        // translate from fullcalendar format to datepicker format
        dateFormat: settings.date_format ? settings.date_format.replace(/M/g, 'm').replace(/mmmmm/, 'MM').replace(/mmm/, 'M').replace(/dddd/, 'DD').replace(/ddd/, 'D').replace(/yy/g, 'y') : 'yy-mm-dd',
        firstDay : settings.first_day,
        dayNamesMin: settings.days_short,
        monthNames: settings.months,
        monthNamesShort: settings.months,
        changeMonth: false,
        showOtherMonths: true,
        selectOtherMonths: true
    };


    /**
     * Quote html entities
     */
    var Q = this.quote_html = function(str)
    {
      return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    /**
     * Create a nice human-readable string for the date/time range
     */
    this.event_date_text = function(event)
    {
      if (!event.start)
        return '';
      if (!event.end)
        event.end = event.start;

      var fromto, duration = event.end.getTime() / 1000 - event.start.getTime() / 1000;
      if (event.allDay && !event.allDayfake) {
        fromto = this.format_datetime(event.start, 1)
          + (duration > 86400 || event.start.getDay() != event.end.getDay() ? ' - ' + this.format_datetime(event.end, 1) : ''); // Mod by Rosali
      }
      else if (duration < 86400 && event.start.getDay() == event.end.getDay()) {
        fromto = this.format_datetime(event.start, 0)
          + (duration > 0 ? ' - ' + this.format_datetime(event.end, 2) : ''); // Mod by Rosali
      }
      else {
        fromto = this.format_datetime(event.start, 0)
          + (duration > 0 ? ' - ' + this.format_datetime(event.end, 0) : ''); // Mod by Rosali
      }

      return fromto;
    };


    /**
     * From time and date strings to a real date object
     */
    this.parse_datetime = function(time, date)
    {
        // we use the utility function from datepicker to parse dates
        var date = date ? $.datepicker.parseDate(datepicker_settings.dateFormat, date, datepicker_settings) : new Date();

        var time_arr = time.replace(/\s*[ap][.m]*/i, '').replace(/0([0-9])/g, '$1').split(/[:.]/);
        if (!isNaN(time_arr[0])) {
            date.setHours(time_arr[0]);
        if (time.match(/p[.m]*/i) && date.getHours() < 12)
            date.setHours(parseInt(time_arr[0]) + 12);
        else if (time.match(/a[.m]*/i) && date.getHours() == 12)
            date.setHours(0);
      }
      if (!isNaN(time_arr[1]))
            date.setMinutes(time_arr[1]);

      return date;
    }

    /**
     * Convert an ISO 8601 formatted date string from the server into a Date object.
     * Timezone information will be ignored, the server already provides dates in user's timezone.
     */
    this.parseISO8601 = function(s)
    {
        // force d to be on check's YMD, for daylight savings purposes
        var fixDate = function(d, check) {
            if (+d) { // prevent infinite looping on invalid dates
                while (d.getDate() != check.getDate()) {
                    d.setTime(+d + (d < check ? 1 : -1) * 3600000);
                }
            }
        }

        // derived from http://delete.me.uk/2005/03/iso8601.html
        var m = s && s.match(/^([0-9]{4})(-([0-9]{2})(-([0-9]{2})([T ]([0-9]{2}):([0-9]{2})(:([0-9]{2})(\.([0-9]+))?)?(Z|(([-+])([0-9]{2})(:?([0-9]{2}))?))?)?)?)?$/);
        if (!m) {
            return null;
        }

        var date = new Date(m[1], 0, 1),
            check = new Date(m[1], 0, 1, 9, 0);
        if (m[3]) {
            date.setMonth(m[3] - 1);
            check.setMonth(m[3] - 1);
        }
        if (m[5]) {
            date.setDate(m[5]);
            check.setDate(m[5]);
        }
        fixDate(date, check);
        if (m[7]) {
            date.setHours(m[7]);
        }
        if (m[8]) {
            date.setMinutes(m[8]);
        }
        if (m[10]) {
            date.setSeconds(m[10]);
        }
        if (m[12]) {
            date.setMilliseconds(Number("0." + m[12]) * 1000);
        }
        fixDate(date, check);

        return date;
    }

    /**
     * Turn the given date into an ISO 8601 date string understandable by PHPs strtotime()
     */
    this.date2ISO8601 = function(date)
    {
        var zeropad = function(num) { return (num < 10 ? '0' : '') + num; };

        return date.getFullYear() + '-' + zeropad(date.getMonth()+1) + '-' + zeropad(date.getDate())
            + 'T' + zeropad(date.getHours()) + ':' + zeropad(date.getMinutes()) + ':' + zeropad(date.getSeconds());
    };

    /**
     * Format the given date object according to user's prefs
     */
    this.format_datetime = function(date, mode)
    {
        var res = '';
        if (!mode || mode == 1)
            res += $.datepicker.formatDate(datepicker_settings.dateFormat, date, datepicker_settings);
        if (!mode)
            res += ' ';
        if (!mode || mode == 2)
            res += this.format_time(date);

        return res;
    }

    /**
     * Clone from fullcalendar.js
     */
    this.format_time = function(date)
    {
        var zeroPad = function(n) { return (n < 10 ? '0' : '') + n; }
        var formatters = {
            s   : function(d) { return d.getSeconds() },
            ss  : function(d) { return zeroPad(d.getSeconds()) },
            m   : function(d) { return d.getMinutes() },
            mm  : function(d) { return zeroPad(d.getMinutes()) },
            h   : function(d) { return d.getHours() % 12 || 12 },
            hh  : function(d) { return zeroPad(d.getHours() % 12 || 12) },
            H   : function(d) { return d.getHours() },
            HH  : function(d) { return zeroPad(d.getHours()) },
            t   : function(d) { return d.getHours() < 12 ? 'a' : 'p' },
            tt  : function(d) { return d.getHours() < 12 ? 'am' : 'pm' },
            T   : function(d) { return d.getHours() < 12 ? 'A' : 'P' },
            TT  : function(d) { return d.getHours() < 12 ? 'AM' : 'PM' }
        };

        var i, i2, c, formatter, res = '', format = settings['time_format'];
        for (i=0; i < format.length; i++) {
            c = format.charAt(i);
            for (i2=Math.min(i+2, format.length); i2 > i; i2--) {
                if (formatter = formatters[format.substring(i, i2)]) {
                    res += formatter(date);
                    i = i2 - 1;
                    break;
                }
            }
            if (i2 == i) {
                res += c;
            }
        }

        return res;
    }

    /**
     * Convert the given Date object into a unix timestamp respecting browser's and user's timezone settings
     */
    this.date2unixtime = function(date)
    {
        var dst_offset = (client_timezone - date.getTimezoneOffset()) * 60;  // adjust DST offset
        return Math.round(date.getTime()/1000 + gmt_offset * 3600 + dst_offset);
    }

    /**
     * Turn a unix timestamp value into a Date object
     */
    this.fromunixtime = function(ts)
    {
        ts -= gmt_offset * 3600;
        var date = new Date(ts * 1000),
            dst_offset = (client_timezone - date.getTimezoneOffset()) * 60;
        if (dst_offset)  // adjust DST offset
            date.setTime((ts + 3600) * 1000);
        return date;
    }

    /**
     * Simple plaintext to HTML converter, makig URLs clickable
     */
    this.text2html = function(str, maxlen, maxlines)
    {
        var html = Q(String(str));

        // limit visible text length
        if (maxlen) {
            var morelink = ' <a href="#more" onclick="$(this).hide().next().show();return false" class="morelink">'+rcmail.gettext('showmore','libcalendaring')+'</a><span style="display:none">',
                lines = html.split(/\r?\n/),
                words, out = '', len = 0;

            for (var i=0; i < lines.length; i++) {
                len += lines[i].length;
                if (maxlines && i == maxlines - 1) {
                    out += lines[i] + '\n' + morelink;
                    maxlen = html.length * 2;
                }
                else if (len > maxlen) {
                    len = out.length;
                    words = lines[i].split(' ');
                    for (var j=0; j < words.length; j++) {
                        len += words[j].length + 1;
                        out += words[j] + ' ';
                        if (len > maxlen) {
                            out += morelink;
                            maxlen = html.length * 2;
                        }
                    }
                    out += '\n';
                }
                else
                    out += lines[i] + '\n';
            }

            if (maxlen > str.length)
                out += '</span>';

            html = out;
        }

        // simple link parser (similar to rcube_string_replacer class in PHP)
        var utf_domain = '[^?&@"\'/\\(\\)\\s\\r\\t\\n]+\\.([^\x00-\x2f\x3b-\x40\x5b-\x60\x7b-\x7f]{2,}|xn--[a-z0-9]{2,})';
        var url1 = '.:;,', url2 = 'a-z0-9%=#@+?&/_~\\[\\]-';
        var link_pattern = new RegExp('([hf]t+ps?://)('+utf_domain+'(['+url1+']?['+url2+']+)*)?', 'ig');
        var mailto_pattern = new RegExp('([^\\s\\n\\(\\);]+@'+utf_domain+')', 'ig');

        return html
            .replace(link_pattern, '<a href="$1$2" class="extlink" target="_blank">$1$2</a>')
            .replace(mailto_pattern, '<a href="mailto:$1">$1</a>')
            .replace(/(mailto:)([^"]+)"/g, '$1$2" onclick="rcmail.command(\'compose\', \'$2\');return false"')
            .replace(/\n/g, "<br/>");
    };

    this.init_alarms_edit = function(prefix)
    {
        // register events on alarm fields
        $(prefix+' select.edit-alarm-type').change(function(){
            $(this).parent().find('span.edit-alarm-values')[(this.selectedIndex>0?'show':'hide')]();
        });
        $(prefix+' select.edit-alarm-offset').change(function(){
            var mode = $(this).val() == '@' ? 'show' : 'hide';
            $(this).parent().find('.edit-alarm-date, .edit-alarm-time')[mode]();
            $(this).parent().find('.edit-alarm-value').prop('disabled', mode == 'show');
        });

        $(prefix+' .edit-alarm-date').datepicker(datepicker_settings);
    }


    /*****  Alarms handling  *****/

    /**
     * Display a notification for the given pending alarms
     */
    this.display_alarms = function(alarms)
    {
        if (parent.tabbed && !self.tabbed) { // Mod by Rosali (tabbed plugin compatibility)
          return;
        }
        
        var focused = $(':focus');
        var is_minimized = false;
        
        // clear old alert first
        if (this.alarm_dialog) {
            // Begin Mod by Rosali (remove previously added divs)
            this.alarm_dialog.dialog('destroy').remove();
            if($('#dialog-extend-fixed-container').get(0)){
              is_minimized = true;
            }
            $('#dialog-extend-fixed-container').remove();
            // End Mod by Rosali
        }
        
        this.alarm_dialog = $('<div>').attr('id', 'alarm-display');

        var actions, adismiss, asnooze, alarm, html, event_ids = [];
        for (var i=0; i < alarms.length; i++) {
            alarm = alarms[i];
            alarm.start = this.parseISO8601(alarm.start);
            alarm.end = this.parseISO8601(alarm.end);
            event_ids.push(alarm.id);

            html = '<h3 class="event-title">' + Q(alarm.title) + '</h3>';
            html += '<div class="event-section">' + Q(alarm.location || '') + '</div>';
            html += '<div class="event-section">' + Q(this.event_date_text(alarm)) + '</div>';

            adismiss = $('<a href="#" class="alarm-action-dismiss"></a>').html(rcmail.gettext('dismiss','libcalendaring')).click(function(){
                me.dismiss_link = $(this);
                me.dismiss_alarm(me.dismiss_link.data('id'), 0);
            });
            asnooze = $('<a href="#" class="alarm-action-snooze"></a>').html(rcmail.gettext('snooze','libcalendaring')).click(function(e){
                me.snooze_dropdown($(this));
                e.stopPropagation();
                return false;
            });
            actions = $('<div>').addClass('alarm-actions').append(adismiss.data('id', alarm.id)).append(asnooze.data('id', alarm.id));

            $('<div>').addClass('alarm-item').html(html).append(actions).appendTo(this.alarm_dialog);
        }

        var buttons = {};
        buttons[rcmail.gettext('dismissall','libcalendaring')] = function() {
            // submit dismissed event_ids to server
            me.dismiss_alarm(me.alarm_ids.join(','), 0);
            $(this).dialog('close');
        };
        
        // Begin Mod by Rosali
        // dialog-extend options
        var dialogExtendOptions = {
            'closable' : true,
            'maximizable' : false,
            'minimizable' : true,
            'minimizeLocation' : 'right',
            'collapsable' : false,
            'dblclick' : 'maximize',
            'load' : function(evt, dlg) {
                if ((rcmail.task == 'mail' && (rcmail.env.action == 'compose' || rcmail.env.action == 'show')) || is_minimized == true) {
                    $('#alarm-display').dialogExtend('minimize');
                    $('#dialog-extend-fixed-container').children().width(300);
                    if (focused.is('input') || focused.is('textarea')) {
                        $(focused).focus();
                    }
                    else if (typeof tinymce == 'object') {
                        window.setTimeout("tinymce.get(rcmail.env.composebody).getBody().focus();", 100);
                    }
                }
            },
            'minimize' : function (evt, dlg) {
              $('#dialog-extend-fixed-container').children().width(300);
            },
        };
        // End Mod by Rosali
        
        this.alarm_dialog.appendTo(document.body).dialog({
            modal: false,
            resizable: true,
            closeOnEscape: false,
            dialogClass: 'alarm',
            title: rcmail.gettext('alarmtitle','libcalendaring'),
            buttons: buttons,
            close: function() {
              $('#alarm-snooze-dropdown').hide();
              $(this).dialog('destroy').remove();
              me.alarm_dialog = null;
              me.alarm_ids = null;
            },
            drag: function(event, ui) {
              $('#alarm-snooze-dropdown').hide();
            }
        }).dialogExtend(dialogExtendOptions); // Mod by Rosali

        this.alarm_ids = event_ids;
    };

    /**
     * Show a drop-down menu with a selection of snooze times
     */
    this.snooze_dropdown = function(link)
    {
        if (!this.snooze_popup) {
            this.snooze_popup = $('#alarm-snooze-dropdown');
            // create popup if not found
            if (!this.snooze_popup.length) {
                this.snooze_popup = $('<div>').attr('id', 'alarm-snooze-dropdown').addClass('popupmenu').appendTo(document.body);
                this.snooze_popup.html(rcmail.env.snooze_select)
            }
            $('#alarm-snooze-dropdown a').click(function(e){
                var time = String(this.href).replace(/.+#/, '');
                me.dismiss_alarm($('#alarm-snooze-dropdown').data('id'), time);
                return false;
            });
        }

        // hide visible popup
        if (this.snooze_popup.is(':visible') && this.snooze_popup.data('id') == link.data('id')) {
            this.snooze_popup.hide();
            this.dismiss_link = null;
        }
        else {  // open popup below the clicked link
            var pos = link.offset();
            pos.top += link.height() + 2;
            this.snooze_popup.data('id', link.data('id')).css({ top:Math.floor(pos.top)+'px', left:Math.floor(pos.left)+'px' }).show();
            this.dismiss_link = link;
        }
    };

    /**
     * Dismiss or snooze alarms for the given event
     */
    this.dismiss_alarm = function(id, snooze)
    {
        $('#alarm-snooze-dropdown').hide();
        rcmail.http_post('utils/plugin.alarms', { action:'dismiss', data:{ id:id, snooze:snooze } });

        // remove dismissed alarm from list
        if (this.dismiss_link) {
            this.dismiss_link.closest('div.alarm-item').hide();
            var new_ids = jQuery.grep(this.alarm_ids, function(v){ return v != id; });
            if (new_ids.length)
                this.alarm_ids = new_ids;
            else
                this.alarm_dialog.dialog('close');
        }

        this.dismiss_link = null;
    };
    
    /*****  Recurrence form handling  *****/

    /**
     * Install event handlers on recurrence form elements
     */
    this.init_recurrence_edit = function(prefix)
    {
        // toggle recurrence frequency forms
        $('#edit-recurrence-frequency').change(function(e){
            var freq = $(this).val().toLowerCase();
            $('.recurrence-form').hide();
            if (freq) {
              $('#recurrence-form-'+freq).show();
              if (freq != 'rdate')
                $('#recurrence-form-until').show();
            }
        });
        $('#recurrence-form-rdate input.button.add').click(function(e){
            var dt, dv = $('#edit-recurrence-rdate-input').val();
            if (dv && (dt = me.parse_datetime('12:00', dv))) {
                me.add_rdate(dt);
                me.sort_rdates();
                $('#edit-recurrence-rdate-input').val('')
            }
            else {
                $('#edit-recurrence-rdate-input').select();
            }
        });
        $('#edit-recurrence-rdates').on('click', 'a.delete', function(e){
            $(this).closest('li').remove();
            return false;
        });

        $('#edit-recurrence-enddate').datepicker(datepicker_settings).click(function(){ $("#edit-recurrence-repeat-until").prop('checked', true) });
        $('#edit-recurrence-repeat-times').change(function(e){ $('#edit-recurrence-repeat-count').prop('checked', true); });
        $('#edit-recurrence-rdate-input').datepicker(datepicker_settings);
    };

    /**
     * Set recurrence form according to the given event/task record
     */
    this.set_recurrence_edit = function(rec)
    {
        var recurrence = $('#edit-recurrence-frequency').val(rec.recurrence ? rec.recurrence.FREQ || (rec.recurrence.RDATE ? 'RDATE' : '') : '').change(),
            interval = $('.recurrence-form select.edit-recurrence-interval').val(rec.recurrence ? rec.recurrence.INTERVAL || 1 : 1),
            rrtimes = $('#edit-recurrence-repeat-times').val(rec.recurrence ? rec.recurrence.COUNT || 1 : 1),
            rrenddate = $('#edit-recurrence-enddate').val(rec.recurrence && rec.recurrence.UNTIL ? this.format_datetime(this.parseISO8601(rec.recurrence.UNTIL), 1) : '');
        $('.recurrence-form input.edit-recurrence-until:checked').prop('checked', false);
        $('#edit-recurrence-rdates').html('');
        
        var weekdays = ['SU','MO','TU','WE','TH','FR','SA'],
            rrepeat_id = '#edit-recurrence-repeat-forever';
        if      (rec.recurrence && rec.recurrence.COUNT) rrepeat_id = '#edit-recurrence-repeat-count';
        else if (rec.recurrence && rec.recurrence.UNTIL) rrepeat_id = '#edit-recurrence-repeat-until';
        $(rrepeat_id).prop('checked', true);

        if (rec.recurrence && rec.recurrence.BYDAY && rec.recurrence.FREQ == 'WEEKLY') {
            var wdays = rec.recurrence.BYDAY.split(',');
            $('input.edit-recurrence-weekly-byday').val(wdays);
        }
        if (rec.recurrence && rec.recurrence.BYMONTHDAY) {
            $('input.edit-recurrence-monthly-bymonthday').val(String(rec.recurrence.BYMONTHDAY).split(','));
            $('input.edit-recurrence-monthly-mode').val(['BYMONTHDAY']);
        }
        if (rec.recurrence && rec.recurrence.BYDAY && (rec.recurrence.FREQ == 'MONTHLY' || rec.recurrence.FREQ == 'YEARLY')) {
            var byday, section = rec.recurrence.FREQ.toLowerCase();
            if ((byday = String(rec.recurrence.BYDAY).match(/(-?[1-4])([A-Z]+)/))) {
                $('#edit-recurrence-'+section+'-prefix').val(byday[1]);
                $('#edit-recurrence-'+section+'-byday').val(byday[2]);
            }
            $('input.edit-recurrence-'+section+'-mode').val(['BYDAY']);
        }
        else if (rec.start) {
            $('#edit-recurrence-monthly-byday').val(weekdays[rec.start.getDay()]);
        }
        if (rec.recurrence && rec.recurrence.BYMONTH) {
            $('input.edit-recurrence-yearly-bymonth').val(String(rec.recurrence.BYMONTH).split(','));
        }
        else if (rec.start) {
            $('input.edit-recurrence-yearly-bymonth').val([String(rec.start.getMonth()+1)]);
        }
        if (rec.recurrence && rec.recurrence.RDATE) {
            $.each(rec.recurrence.RDATE, function(i,rdate){
                me.add_rdate(me.parseISO8601(rdate));
            });
        }
    };

    /**
     * Gather recurrence settings from form
     */
    this.serialize_recurrence = function(timestr)
    {
        var recurrence = '',
            freq = $('#edit-recurrence-frequency').val();

        if (freq != '') {
            recurrence = {
                FREQ: freq,
                INTERVAL: $('#edit-recurrence-interval-'+freq.toLowerCase()).val()
            };

            var until = $('input.edit-recurrence-until:checked').val();

            if (until == 'count')
                recurrence.COUNT = $('#edit-recurrence-repeat-times').val();
            else if (until == 'until')
                recurrence.UNTIL = me.date2ISO8601(me.parse_datetime(timestr || '00:00', $('#edit-recurrence-enddate').val()));

            if (freq == 'WEEKLY') {
                var byday = [];
                $('input.edit-recurrence-weekly-byday:checked').each(function(){ byday.push(this.value); });
                if (byday.length)
                    recurrence.BYDAY = byday.join(',');
            }
            else if (freq == 'MONTHLY') {
                var mode = $('input.edit-recurrence-monthly-mode:checked').val(), bymonday = [];
                if (mode == 'BYMONTHDAY') {
                    $('input.edit-recurrence-monthly-bymonthday:checked').each(function(){ bymonday.push(this.value); });
                    if (bymonday.length)
                        recurrence.BYMONTHDAY = bymonday.join(',');
                }
                else
                    recurrence.BYDAY = $('#edit-recurrence-monthly-prefix').val() + $('#edit-recurrence-monthly-byday').val();
            }
            else if (freq == 'YEARLY') {
                var byday, bymonth = [];
                $('input.edit-recurrence-yearly-bymonth:checked').each(function(){ bymonth.push(this.value); });
                if (bymonth.length)
                    recurrence.BYMONTH = bymonth.join(',');
                if ((byday = $('#edit-recurrence-yearly-byday').val()))
                    recurrence.BYDAY = $('#edit-recurrence-yearly-prefix').val() + byday;
            }
            else if (freq == 'RDATE') {
                recurrence = { RDATE:[] };
                // take selected but not yet added date into account
                if ($('#edit-recurrence-rdate-input').val() != '') {
                    $('#recurrence-form-rdate input.button.add').click();
                }
                $('#edit-recurrence-rdates li').each(function(i, li){
                    recurrence.RDATE.push($(li).attr('data-value'));
                });
            }
        }

        return recurrence;
    };

    // add the given date to the RDATE list
    this.add_rdate = function(date)
    {
        var li = $('<li>')
            .attr('data-value', this.date2ISO8601(date))
            .html('<span>' + Q(this.format_datetime(date, 1)) + '</span>')
            .appendTo('#edit-recurrence-rdates');

        $('<a>').attr('href', '#del')
            .addClass('iconbutton delete')
            .html(rcmail.get_label('delete', 'libcalendaring'))
            .attr('title', rcmail.get_label('delete', 'libcalendaring'))
            .appendTo(li);
    };

    // re-sort the list items by their 'data-value' attribute
    this.sort_rdates = function()
    {
        var mylist = $('#edit-recurrence-rdates'),
            listitems = mylist.children('li').get();
        listitems.sort(function(a, b) {
            var compA = $(a).attr('data-value');
            var compB = $(b).attr('data-value');
            return (compA < compB) ? -1 : (compA > compB) ? 1 : 0;
        })
        $.each(listitems, function(idx, item) { mylist.append(item); });
    };
}


// extend jQuery
(function($){
  $.fn.serializeJSON = function(){
    var json = {};
    jQuery.map($(this).serializeArray(), function(n, i) {
      json[n['name']] = n['value'];
    });
    return json;
  };
})(jQuery);


/* libcalendaring plugin initialization */
window.rcmail && rcmail.addEventListener('init', function(evt) {
  if (rcmail.env.libcal_settings) {
    var libcal = new rcube_libcalendaring(rcmail.env.libcal_settings);
    rcmail.addEventListener('plugin.display_alarms', function(alarms){ libcal.display_alarms(alarms); });
    if (!rcmail.env.framed && !rcmail.env.extwin) {
      //window.setTimeout("rcmail.refresh();", 1000); // Mod by Rosali (fetch reminders almost immediately)
    }
  }
});
