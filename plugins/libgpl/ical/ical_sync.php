<?php
/**
 * iCalendar sync for the Calendar plugin
 *
 * @version @package_version@
 * @author Daniel Morlock <daniel.morlock@awesome-it.de>
 *
 * Copyright (C) 2013, Awesome IT GbR <info@awesome-it.de>
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

class ical_sync
{
    const ACTION_NONE = 1;
    const ACTION_UPDATE = 2;
    const ACTION_CREATE = 4;

    private $cal_id = null;
    private $url = null;
    private $user = null;
    private $pass = null;
    private $etag = null;
    private $ical = null;

    public $sync = 0;
    
    /**
     *  Default constructor for calendar synchronization adapter.
     *
     * @param int Calendar id.
     * @param array Hash array with ical properties:
     *   url: Absolute URL to iCAL resource.
     */
    public function __construct($cal_id, $props)
    {
        $this->ical = libcalendaring::get_ical();
        $this->cal_id = $cal_id;

        $this->url = $props["url"];
        $this->user = isset($props["user"]) ? $props["user"] : null;
        $this->pass = isset($props["pass"]) ? $props["pass"] : null;
        $this->sync = isset($props["sync"]) ? $props["sync"] : 0;
        $this->etag = isset($props["tag"]) ? $props["tag"] : null;
    }

    /**
     * Determines whether current calendar needs to be synced.
     *
     * @return True if the current calendar needs to be synced, false otherwise.
     */
    public function is_synced()
    {
        if($this->etag)
        {
            if($this->etag === $this->get_etag())
            {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Fetch ETag.
     *
     * @return string ETag or false.
     */
    public function get_etag()
    {
        if($this->user != null && $this->pass != null)
        {
            stream_context_set_default(
                array(
                    'http' => array(
                        'header' => "Authorization: Basic " . base64_encode("$this->user:$this->pass") . "\r\n" .
                                    "User-Agent: PHP/" . PHP_VERSION
                    )
                )
            );
        }
        $headers = get_headers($this->url, 1);
        foreach($headers as $key => $val)
        {
            $headers[strtolower($key)] = $val;
        }
        if(isset($headers['etag']))
        {
            return str_replace(array("'", '"'), '', $headers['etag']);
        }
        return false;
    }

    /**
     * Fetches events from iCAL resource and returns updates.
     *
     * @param array List of local events.
     * @return array Tuple containing the following lists:
     *
     * Hash list for iCAL events to be created or to be updated with the keys:
     *  local_event: The local event in case of an update.
     * remote_event: The current event retrieved from caldav server.
     *
     * A list of event ids that are in sync.
     */
    public function get_updates($events)
    {
        $context = null;
        if($this->user != null && $this->pass != null)
        {
            $context = stream_context_create(array(
                'http' => array(
                    'header' => "Authorization: Basic " . base64_encode("$this->user:$this->pass") . "\r\n" .
                                "User-Agent: PHP/" . PHP_VERSION
                )
            ));
        }

        $vcal = file_get_contents($this->url, false, $context);
        $charset = 'UTF-8';
        foreach((array) $http_response_header as $c => $h)
        {
            if(stristr($h, 'content-type') && stristr($h, 'charset'))
            {
                preg_match('@Content-Type:\s+([\w/+]+)(;\s+charset=(\S+))?@i', $h, $matches);
                if(isset($matches[3]))
                {
                    $charset = strtoupper(trim($matches[3]));
                }
            }
            if(stristr($h, 'content-encoding') && stristr($h, 'gzip'))
            {
                $vcal = gzinflate(substr($vcal, 10, -8));
            }
        }

        $updates = array();
        $synced = array();
        if($vcal !== false)
        {
            // Hash existing events by uid.
            $events_hash = array();
            foreach($events as $event) {
                $events_hash[$event['uid']] = $event;
            }
            foreach ($this->ical->import($vcal, $charset, false, false) as $remote_event) {
                // Attach remote event to current calendar
                $remote_event["calendar"] = $this->cal_id;

                $local_event = null;
                if($events_hash[$remote_event['uid']])
                    $local_event = $events_hash[$remote_event['uid']];

                // Determine whether event don't need an update.
                if($local_event && $local_event["changed"] >= $remote_event["changed"])
                {
                    array_push($synced, $local_event["id"]);
                }
                else
                {
                    array_push($updates, array('local_event' => $local_event, 'remote_event' => $remote_event));
                }
            }
        }

        return array($updates, $synced);
    }
}

;
?>