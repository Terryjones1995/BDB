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
| Texture | **on, with PBR** | With it off, or exported before the texture step, the model is bare grey geometry. |
| Geometry detail | **standard** | The highest setting gives ~1.9 million triangles and a 44 MB file for no visible gain. |
| One prompt | **one object** | "City skyline" came back as a fused block of buildings with a flat back. |

The bus is the reference result: 190,217 triangles, colour + metallic/roughness + normal maps,
8.5 MB raw, 263 KB after fitting. Taylor's Tripo has no negative-prompt box, so the exclusions
("no people, no driver, no background") go inside the prompt.

## Checking a model that arrives

1. `tools/glbinfo.py` — it must have a base-colour texture, no skeleton, and sit on y = 0.
2. `tools/modelshot` — look at the four-view sheet: is it one object, the right thing, with dark
   glass rather than white windows, and no real brand badge or lettering?
3. `tools/fit-model.py` — shrink it into `city/models/<name>.glb`, then render that too.
4. Update the table below.

Tripo exports are normalised: the longest side is 1 unit, the base is at y = 0, and the front has
faced +z on everything so far. Real-world size is applied when the model is wired into the game.

## The list

Status: **in** = fitted and in `city/models/` · **made** = looks right in Tripo, file not received
yet · **redo** = received, not usable as is · blank = wanted.

| File | What | Status |
|---|---|---|
| `city_bus.glb` | City bus | **in** — 263 KB, 7,990 triangles |
| `fire_station.glb` | Fire station | made |
| `city_hall.glb` | City hall | made |
| `car_sedan.glb` | Everyday sedan, white (recoloured in game) | redo — first try had flat colours and white windows (18,881 triangles, colour only); usable as a police-car base at most |
| `car_suv.glb` | SUV, white | |
| `car_hatchback.glb` | Hatchback, white | |
| `car_pickup.glb` | Pickup, white | |
| `car_sports.glb` | Sports coupe, white | |
| `van.glb` | Panel van, white | |
| `taxi.glb` | Taxi | |
| `police_car.glb` | Police car | redo — first try had arms (Pose was on) |
| `ambulance.glb` | Ambulance | |
| `fire_truck.glb` | Fire engine | redo — first try came out as a person |
| `box_truck.glb` | Box truck | |
| `garbage_truck.glb` | Garbage truck | |
| `semi_truck.glb` | Semi with trailer | |
| `airliner.glb` | Passenger jet | |
| `cargo_plane.glb` | Cargo jet | |
| `private_jet.glb` | Business jet | |
| `helicopter.glb` | Helicopter | |
| `airport_terminal.glb` | Airport terminal | |
| `control_tower.glb` | Control tower | |
| `hangar.glb` | Hangar | |
| `police_station.glb` | Police station | redo — first try came out as a person |
| `hospital.glb` | Hospital (blue H sign, not a red cross) | redo — first try came out as a person |
| `school.glb` | Elementary school | |
| `jail.glb` | Jail | |
| `train_station.glb` | Train station | |
| `commuter_train.glb` | One train carriage (chained in game) | |
| `cargo_ship.glb` | Container ship | |
| `power_plant.glb` | Coal power station | |
| `wind_turbine.glb` | Wind turbine | |
| `solar_array.glb` | Solar farm | |
| `water_tower.glb` | Water tower | |
| `water_plant.glb` | Water treatment plant | |
| `recycling_center.glb` | Recycling depot | |
| `stadium.glb` | Stadium | |
| `casino.glb` | Casino resort | |
| `shopping_mall.glb` | Shopping mall | |
| `hotel_tower.glb` | Hotel tower | |
| `tv_tower.glb` | TV tower | |
| `museum.glb` | Museum | |
| `ferris_wheel.glb` | Ferris wheel | |
| `university.glb` | University hall | |
| `mayor_statue.glb` | Bronze statue on a pedestal | |

Also received and set aside: a Honda City (accurate shape, but untextured, 1.9 million triangles,
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
