# O-Network Monitor

## 0.2.0

A new dashboard: a small hardware monitoring station for the machines around you. **Home** shows
CPU, GPU, RAM and network at a glance, each with its own screen and a live graph, and **More**
reaches storage, processes, the device list, settings and a debug view of the raw data. Devices
that go quiet show as offline with the time of their last report.

Data comes from one telemetry format every future agent will speak, with each field checked before
it is shown. **Mock** runs four pretend machines so the whole dashboard can be explored today;
**Live** measures this Car Thing's own link as before and shows any agent reporting through the
desktop extension.

## 0.1.2

The app is called **O-Network Monitor** now, on the store card, on the device and in the tab it
opens in. Nothing else about it changes: same id, same settings, same data, so an installed copy
updates in place and simply reads O-Network Monitor afterwards.

## 0.1.1

An icon of its own for the store and the launcher.

## 0.1.0

First release. Link status, latency, measured download and a 60 second graph.
Upload and local IP report as unavailable: they need interface counters that the
daemon does not expose.
