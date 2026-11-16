# BDB City — models from Tripo

Taylor generates the special buildings and the vehicles in Tripo and sends the `.glb` files; we
check them, shrink them and fit them into the game. The game itself generates ordinary houses,
apartment and office towers, shops, roads, runways, trees and people, so **none of those are on
this list** — that is how a city gets huge without a huge download.

Fitted models live in `city/models/`. Raw exports are not kept in the repo (1–45 MB each).

## Tripo settings that work

Learned the hard way on the first batch:

| Setting | Use | What goes wrong otherwise |
|---|---|---|
| Pose | **off / none** | T-pose is for characters. Left on, a car grows arms and a hospital comes out as a person. |
| Texture | **on** (PBR maps are optional) | With it off, or exported before the texture step, the model is bare grey geometry. |
| Geometry detail | **standard** | The highest setting gives ~1.9 million triangles and a 44 MB file for no visible gain. |
| One prompt | **one object** | "City skyline" came back as a fused block of buildings with a flat back. |

The bus came from the heavier setting: 190,217 triangles, colour + metallic/roughness + normal maps,
8.5 MB raw, 263 KB after fitting. The lighter setting (about 18,000 triangles, colour only, 1–2 MB raw)
looks just as good at game size and is what the rest were made with. Taylor's Tripo has no negative-prompt box, so the exclusions
("no people, no driver, no background") go inside the prompt.

## Checking a model that arrives

1. `tools/glbinfo.py` — it must have a base-colour texture, no skeleton, and sit on y = 0.
2. `tools/modelshot` — look at the four-view sheet: is it one object, the right thing, with dark
   glass rather than white windows, and no real brand badge or lettering?
3. `tools/fit-model.py` — shrink it into `city/models/<name>.glb`, then render that too.
4. Update the table below.

Tripo exports are normalised: the longest side is 1 unit and the base is at y = 0. Which way the front
faces varies from model to model (see the note under the list). Real-world size is applied when the
model is wired into the game.

## The list

Status: **in** = fitted and in `city/models/` · **made** = looks right in Tripo, file not received
yet · **wanted** = not made yet.

| File | What | Status |
|---|---|---|
| `city_bus.glb` | City bus | **in** — 263 KB, 7,990 triangles |
| `fire_station.glb` | Fire station | made — file not received yet |
| `city_hall.glb` | City hall | made — file not received yet |
| `car_sedan.glb` | Everyday sedan, white (recoloured in game) | **in** — 163 KB, 7,995 triangles |
| `car_sedan_b.glb` | A second white sedan, from Taylor's own prompt | **in** — 158 KB, 7,999 triangles. Has a small made-up badge on the grille. |
| `car_suv.glb` | SUV, white | **in** — 179 KB, 7,992 triangles |
| `car_hatchback.glb` | Hatchback, white | **in** — 161 KB, 8,000 triangles. Has a small made-up badge on the grille. |
| `car_pickup.glb` | Pickup, white | **in** — 168 KB, 7,998 triangles |
| `car_sports.glb` | Sports coupe, white | **in** — 146 KB, 7,999 triangles |
| `van.glb` | Panel van, white | **in** — 176 KB, 7,988 triangles |
| `taxi.glb` | Taxi | **in** — 162 KB, 7,997 triangles |
| `police_car.glb` | Police car | **in** — 150 KB, 7,986 triangles |
| `ambulance.glb` | Ambulance | **in** — 189 KB, 7,994 triangles |
| `fire_truck.glb` | Fire engine | **in** — 272 KB, 9,980 triangles |
| `box_truck.glb` | Box truck | **in** — 163 KB, 7,992 triangles |
| `garbage_truck.glb` | Garbage truck | **in** — 193 KB, 9,251 triangles |
| `semi_truck.glb` | Semi with trailer | **in** — 172 KB, 7,993 triangles |
| `airliner.glb` | Passenger jet | **in** — 139 KB, 7,988 triangles |
| `cargo_plane.glb` | Cargo jet (came out with cabin windows; reads as a second airliner) | **in** — 136 KB, 7,994 triangles |
| `private_jet.glb` | Business jet | **in** — 128 KB, 7,994 triangles |
| `helicopter.glb` | Helicopter | **in** — 157 KB, 7,984 triangles |
| `airport_terminal.glb` | Airport terminal | **in** — 181 KB, 10,000 triangles |
| `control_tower.glb` | Control tower | **in** — 148 KB, 9,999 triangles |
| `hangar.glb` | Hangar | wanted |
| `police_station.glb` | Police station | **in** — 147 KB, 9,999 triangles |
| `hospital.glb` | Hospital | **in** — 229 KB, 9,997 triangles |
| `school.glb` | Elementary school | **in** — 172 KB, 10,000 triangles. Fine from the front, blank wall at the back. |
| `jail.glb` | Jail | **in** — 214 KB, 10,137 triangles |
| `train_station.glb` | Train station | **in** — 221 KB, 9,991 triangles |
| `commuter_train.glb` | One train carriage (chained in game) | **in** — 212 KB, 8,150 triangles |
| `cargo_ship.glb` | Container ship | **in** — 251 KB, 11,957 triangles |
| `power_plant.glb` | Coal power station | **in** — 218 KB, 11,936 triangles |
| `wind_turbine.glb` | Wind turbine | **in** — 107 KB, 9,998 triangles |
| `solar_array.glb` | Solar farm | **in** — 176 KB, 9,994 triangles |
| `water_tower.glb` | Water tower | **in** — 174 KB, 9,998 triangles |
| `water_plant.glb` | Water treatment plant | **in** — 241 KB, 12,322 triangles |
| `recycling_center.glb` | Recycling depot | **in** — 200 KB, 9,996 triangles |
| `stadium.glb` | Stadium | **in** — 277 KB, 11,986 triangles |
| `casino.glb` | Casino resort | **in** — 217 KB, 9,995 triangles. Weakest of the batch: the roofs are flat yellow slabs. Worth a retry. |
| `shopping_mall.glb` | Shopping mall | **in** — 179 KB, 9,998 triangles |
| `hotel_tower.glb` | Hotel tower | **in** — 234 KB, 9,999 triangles |
| `tv_tower.glb` | TV tower | **in** — 210 KB, 9,997 triangles |
| `museum.glb` | Museum | **in** — 182 KB, 9,981 triangles |
| `ferris_wheel.glb` | Ferris wheel | **in** — 381 KB, 15,984 triangles |
| `university.glb` | University hall | **in** — 246 KB, 9,999 triangles |
| `mayor_statue.glb` | Bronze statue on a pedestal | **in** — 172 KB, 10,000 triangles |

43 are in. The second batch (15 November 2026, 42 files) was generated with the detailed prompts and
lighter settings than the bus: about 18,000 triangles and a colour texture only. They look right and
are much smaller, so that is the setting to keep. None of them is wired into the game yet.

Not normalised yet: **which way each model faces.** Tripo put the long side on x for some and on z for
others, so the front is not consistently +z. Fix it per model when it is wired in, not by eye in bulk.

Also received and set aside: a first sedan (flat colours, white windows), a Honda City (accurate shape, but untextured, 1.9 million triangles,
and a real make with its badge — the cars here stay generic) and a "city skyline" (a fused block,
not a building).

## Writing a prompt

Taylor was given a full detailed prompt for every row above on 15 November 2026. If one needs
rewriting, keep the same shape. Every phrase should describe something visible; mood, lighting and
story make results worse.

1. **"A single …"** and the plain name of the thing. Lead with *building* or *vehicle* words; a
   prompt that opens with "police" or "fire" can come back as a person.
2. **Shape:** storeys, footprint, roof; or body type and proportions.
3. **Parts:** doors, windows, rooftop gear; wheels, lights, mirrors.
4. **Materials and colours**, named: tan brick, blue-tinted glass, glossy pure white paint.
5. **Style line:** `Realistic …, clean hard-surface model, PBR materials.`
6. **Exclusions**, inside the prompt: one object only, no people, no driver, no ground, no
   background, blank signs with no text, generic unbranded design with no badge.

Vehicle example:

```
A single modern four-door family sedan car, generic unbranded design. Smooth aerodynamic body in glossy pure white paint, dark tinted glass windows all round, black window trim, body-coloured door handles and mirrors. Four black rubber tyres with five-spoke silver alloy wheels. Clear headlights, red tail lights, plain black grille with no badge, blank licence plates. Realistic proportions, clean hard-surface model, PBR materials. One empty car only, wheels on the ground, no driver, no ground, no background.
```

Building example:

```
A single modern police station building exterior. Two storeys, rectangular, walls of pale grey concrete panels with horizontal bands of blue-tinted windows, a glass entrance lobby with double doors under a flat concrete canopy, wide front steps with a wheelchair ramp and steel railings, a flagpole by the entrance, a flat roof with a tall radio antenna mast and air-conditioning units, two vehicle garage doors on one side. Blank sign with no text. Realistic contemporary architecture, clean hard-surface model, PBR materials. One isolated building only on a thin concrete base, no people, no vehicles, no trees, no background.
```

Everyday cars are asked for in white on purpose: the game tints them, so a handful of models
becomes a street full of different cars.
