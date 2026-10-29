/*
 * Football Blitz '26 — 2026 team rosters.
 *
 * Roster snapshot: starters from late-October 2026 (Week 8) depth charts.
 * Each team fields its 5 headline offensive players (QB, RB, WR, WR, TE) and
 * 5 headline defenders (2 front, 1 second-level, 2 secondary). The two
 * offensive linemen and two depth defenders on the field are generic.
 * Players on injured reserve at snapshot time were left out where the
 * depth chart made that clear.
 *
 * fp = fantasy points per game seed (see template.js). Offense uses PPR,
 * defense uses IDP. Values are rounded approximations of each player's most
 * recent full NFL season (2025); rookies ("rk") use a 2026 projection.
 * Tags tweak the template (see FB.Template.TRAITS).
 */
(function () {
  var FB = (window.FB = window.FB || {});

  function P(name, pos, fp, tags, rk) { return { name: name, pos: pos, fp: fp, tags: tags || [], rk: !!rk }; }

  // colors: jersey, trim (numbers/stripes), helmet, pants, stripe (helmet stripe)
  var TEAMS = [
    // ---------------- AFC EAST ----------------
    { abbr: 'BUF', city: 'Buffalo', name: 'Bills', conf: 'AFC East',
      c: { jersey: '#00338D', trim: '#C60C30', helmet: '#F4F4F4', pants: '#F4F4F4', stripe: '#C60C30' },
      off: [P('Josh Allen', 'QB', 22.5, ['scrambler', 'cannon']), P('James Cook', 'RB', 19.5, ['burner', 'elusive']), P('DJ Moore', 'WR', 11.5), P('Khalil Shakir', 'WR', 11.5, ['hands']), P('Dalton Kincaid', 'TE', 10.5)],
      def: [P('Greg Rousseau', 'EDGE', 9.5), P('Deone Walker', 'DT', 6), P('Bradley Chubb', 'OLB', 9), P('Christian Benford', 'CB', 8.5), P('Cole Bishop', 'S', 8)] },
    { abbr: 'MIA', city: 'Miami', name: 'Dolphins', conf: 'AFC East',
      c: { jersey: '#008E97', trim: '#FC4C02', helmet: '#F4F4F4', pants: '#F4F4F4', stripe: '#008E97' },
      off: [P('Malik Willis', 'QB', 14, ['scrambler']), P('Ollie Gordon II', 'RB', 7, ['power']), P('Chris Bell', 'WR', 9, [], true), P('Malik Washington', 'WR', 8, ['elusive']), P('Greg Dulcich', 'TE', 6)],
      def: [P('Chop Robinson', 'EDGE', 8, ['rusher']), P('Zach Sieler', 'DT', 9), P('Jordyn Brooks', 'LB', 14.5, ['tackler']), P('Jason Marshall Jr.', 'CB', 6.5), P('Dante Trader Jr.', 'S', 6)] },
    { abbr: 'NE', city: 'New England', name: 'Patriots', conf: 'AFC East',
      c: { jersey: '#002244', trim: '#C60C30', helmet: '#B0B7BC', pants: '#F4F4F4', stripe: '#C60C30' },
      off: [P('Drake Maye', 'QB', 21.5, ['mobile']), P('Rhamondre Stevenson', 'RB', 11, ['power']), P('A.J. Brown', 'WR', 15, ['power']), P('DeMario Douglas', 'WR', 9, ['elusive']), P('Hunter Henry', 'TE', 11, ['hands'])],
      def: [P("Dre'Mont Jones", 'EDGE', 7.5), P('Milton Williams', 'DT', 7.5), P('Robert Spillane', 'LB', 13, ['tackler']), P('Christian Gonzalez', 'CB', 9.5), P('Kevin Byard', 'S', 10, ['ballhawk'])] },
    { abbr: 'NYJ', city: 'New York', name: 'Jets', conf: 'AFC East',
      c: { jersey: '#125740', trim: '#F4F4F4', helmet: '#125740', pants: '#F4F4F4', stripe: '#F4F4F4' },
      off: [P('Geno Smith', 'QB', 15.5), P('Breece Hall', 'RB', 15, ['burner']), P('Garrett Wilson', 'WR', 15.5, ['elusive']), P('Adonai Mitchell', 'WR', 6, ['burner']), P('Kenyon Sadiq', 'TE', 9, ['burner'], true)],
      def: [P('Will McDonald IV', 'EDGE', 8, ['rusher']), P('David Bailey', 'EDGE', 8, ['rusher'], true), P('Demario Davis', 'LB', 13.5, ['tackler']), P("Azareye'h Thomas", 'CB', 6), P('Minkah Fitzpatrick', 'S', 9, ['ballhawk'])] },

    // ---------------- AFC NORTH ----------------
    { abbr: 'BAL', city: 'Baltimore', name: 'Ravens', conf: 'AFC North',
      c: { jersey: '#241773', trim: '#9E7C0C', helmet: '#101010', pants: '#F4F4F4', stripe: '#241773' },
      off: [P('Lamar Jackson', 'QB', 19.5, ['scrambler']), P('Derrick Henry', 'RB', 18, ['power']), P('Zay Flowers', 'WR', 15, ['elusive']), P('Rashod Bateman', 'WR', 7.5), P('Mark Andrews', 'TE', 10, ['hands'])],
      def: [P('Trey Hendrickson', 'EDGE', 10, ['rusher']), P('Calais Campbell', 'DT', 7), P('Roquan Smith', 'LB', 14.5, ['tackler']), P('Marlon Humphrey', 'CB', 8), P('Kyle Hamilton', 'S', 11.5)] },
    { abbr: 'CIN', city: 'Cincinnati', name: 'Bengals', conf: 'AFC North',
      c: { jersey: '#101010', trim: '#FB4F14', helmet: '#FB4F14', pants: '#F4F4F4', stripe: '#101010' },
      off: [P('Joe Burrow', 'QB', 18, ['cannon']), P('Chase Brown', 'RB', 16.5, ['elusive']), P("Ja'Marr Chase", 'WR', 19, ['burner', 'hands']), P('Tee Higgins', 'WR', 14, ['hands']), P('Mike Gesicki', 'TE', 7)],
      def: [P('Boye Mafe', 'EDGE', 7), P('Dexter Lawrence II', 'DT', 8.5, ['power']), P('Demetrius Knight Jr.', 'LB', 11), P('DJ Turner II', 'CB', 7.5), P('Jordan Battle', 'S', 9)] },
    { abbr: 'CLE', city: 'Cleveland', name: 'Browns', conf: 'AFC North',
      c: { jersey: '#311D00', trim: '#FF3C00', helmet: '#FF3C00', pants: '#F4F4F4', stripe: '#311D00' },
      off: [P('Deshaun Watson', 'QB', 11.5, ['mobile']), P('Quinshon Judkins', 'RB', 13, ['power']), P('Jerry Jeudy', 'WR', 9, ['elusive']), P('Denzel Boston', 'WR', 9, [], true), P('Harold Fannin Jr.', 'TE', 10)],
      def: [P('Isaiah McGuire', 'EDGE', 7), P('Maliek Collins', 'DT', 6.5), P('Carson Schwesinger', 'LB', 12.5, ['tackler']), P('Denzel Ward', 'CB', 8.5, ['ballhawk']), P('Grant Delpit', 'S', 9.5)] },
    { abbr: 'PIT', city: 'Pittsburgh', name: 'Steelers', conf: 'AFC North',
      c: { jersey: '#101820', trim: '#FFB612', helmet: '#101820', pants: '#FFB612', stripe: '#FFB612' },
      off: [P('Aaron Rodgers', 'QB', 15.5), P('Jaylen Warren', 'RB', 13, ['elusive']), P('DK Metcalf', 'WR', 13, ['burner', 'power']), P('Michael Pittman Jr.', 'WR', 13, ['hands']), P('Pat Freiermuth', 'TE', 8)],
      def: [P('T.J. Watt', 'EDGE', 11, ['rusher']), P('Nick Herbig', 'EDGE', 9, ['rusher']), P('Patrick Queen', 'LB', 13), P('Jamel Dean', 'CB', 6.5), P('Jalen Ramsey', 'DB', 9.5, ['ballhawk'])] },

    // ---------------- AFC SOUTH ----------------
    { abbr: 'HOU', city: 'Houston', name: 'Texans', conf: 'AFC South',
      c: { jersey: '#03202F', trim: '#A71930', helmet: '#03202F', pants: '#F4F4F4', stripe: '#A71930' },
      off: [P('C.J. Stroud', 'QB', 15.5), P('Woody Marks', 'RB', 10), P('Nico Collins', 'WR', 16, ['power', 'hands']), P('Marvin Harrison Jr.', 'WR', 12), P('Dalton Schultz', 'TE', 9.5, ['hands'])],
      def: [P('Will Anderson Jr.', 'EDGE', 12.5, ['rusher']), P('Danielle Hunter', 'EDGE', 11.5, ['rusher']), P('Calen Bullock', 'S', 9.5, ['ballhawk']), P('Derek Stingley Jr.', 'CB', 10, ['ballhawk']), P('Kamari Lassiter', 'CB', 8)] },
    { abbr: 'IND', city: 'Indianapolis', name: 'Colts', conf: 'AFC South',
      c: { jersey: '#002C5F', trim: '#F4F4F4', helmet: '#F4F4F4', pants: '#F4F4F4', stripe: '#002C5F' },
      off: [P('Daniel Jones', 'QB', 18, ['mobile']), P('Jonathan Taylor', 'RB', 22, ['burner', 'power']), P('Josh Downs', 'WR', 11, ['hands']), P('Keenan Allen', 'WR', 12, ['hands']), P('Tyler Warren', 'TE', 12)],
      def: [P('Laiatu Latu', 'EDGE', 8.5, ['rusher']), P('DeForest Buckner', 'DT', 8.5), P('Cam Bynum', 'S', 9), P('Sauce Gardner', 'CB', 8.5), P('Charvarius Ward', 'CB', 7.5)] },
    { abbr: 'JAX', city: 'Jacksonville', name: 'Jaguars', conf: 'AFC South',
      c: { jersey: '#006778', trim: '#D7A22A', helmet: '#101820', pants: '#F4F4F4', stripe: '#D7A22A' },
      off: [P('Trevor Lawrence', 'QB', 18.5, ['mobile']), P('Bhayshul Tuten', 'RB', 8, ['burner']), P('Brian Thomas Jr.', 'WR', 11.5, ['burner']), P('Jakobi Meyers', 'WR', 11, ['hands']), P('Brenton Strange', 'TE', 9)],
      def: [P('Josh Hines-Allen', 'EDGE', 10, ['rusher']), P('Travon Walker', 'EDGE', 8), P('Foye Oluokun', 'LB', 13.5, ['tackler']), P('Travis Hunter', 'CB', 7.5, ['ballhawk']), P('Jourdan Lewis', 'CB', 8)] },
    { abbr: 'TEN', city: 'Tennessee', name: 'Titans', conf: 'AFC South',
      c: { jersey: '#0C2340', trim: '#4B92DB', helmet: '#0C2340', pants: '#F4F4F4', stripe: '#4B92DB' },
      off: [P('Cam Ward', 'QB', 13.5, ['mobile', 'cannon']), P('Tony Pollard', 'RB', 12.5), P('Calvin Ridley', 'WR', 9, ['burner']), P("Wan'Dale Robinson", 'WR', 13.5, ['elusive']), P('Gunnar Helm', 'TE', 8)],
      def: [P('Jeffery Simmons', 'DT', 9.5, ['power']), P('John Franklin-Myers', 'DE', 7), P('Cedric Gray', 'LB', 13), P('Alontae Taylor', 'CB', 7.5), P('Amani Hooker', 'S', 8.5)] },

    // ---------------- AFC WEST ----------------
    { abbr: 'KC', city: 'Kansas City', name: 'Chiefs', conf: 'AFC West',
      c: { jersey: '#E31837', trim: '#FFB81C', helmet: '#E31837', pants: '#F4F4F4', stripe: '#F4F4F4' },
      off: [P('Patrick Mahomes', 'QB', 20, ['mobile', 'cannon']), P('Kenneth Walker III', 'RB', 13.5, ['elusive']), P('Rashee Rice', 'WR', 17, ['power']), P('Xavier Worthy', 'WR', 9.5, ['burner']), P('Travis Kelce', 'TE', 12.5, ['hands'])],
      def: [P('Chris Jones', 'DT', 9.5, ['rusher']), P('Felix Anudike-Uzomah', 'EDGE', 5.5), P('Nick Bolton', 'LB', 13, ['tackler']), P("L'Jarius Sneed", 'CB', 7), P('Alohi Gilman', 'S', 8)] },
    { abbr: 'DEN', city: 'Denver', name: 'Broncos', conf: 'AFC West',
      c: { jersey: '#FB4F14', trim: '#002244', helmet: '#002244', pants: '#F4F4F4', stripe: '#FB4F14' },
      off: [P('Bo Nix', 'QB', 19, ['mobile']), P('J.K. Dobbins', 'RB', 14), P('Jaylen Waddle', 'WR', 14, ['burner']), P('Courtland Sutton', 'WR', 13.5, ['power']), P('Evan Engram', 'TE', 8)],
      def: [P('Nik Bonitto', 'OLB', 12, ['rusher']), P('Zach Allen', 'DE', 10), P('Talanoa Hufanga', 'S', 10, ['tackler']), P('Pat Surtain II', 'CB', 9.5, ['ballhawk']), P('Riley Moss', 'CB', 8)] },
    { abbr: 'LAC', city: 'Los Angeles', name: 'Chargers', conf: 'AFC West',
      c: { jersey: '#0080C6', trim: '#FFC20E', helmet: '#F4F4F4', pants: '#F4F4F4', stripe: '#0080C6' },
      off: [P('Justin Herbert', 'QB', 19, ['cannon', 'mobile']), P('Omarion Hampton', 'RB', 15, ['power']), P('Ladd McConkey', 'WR', 13, ['elusive']), P('Quentin Johnston', 'WR', 13, ['burner']), P('Charlie Kolar', 'TE', 4)],
      def: [P('Khalil Mack', 'EDGE', 9.5, ['rusher']), P('Tuli Tuipulotu', 'EDGE', 9.5), P('Daiyan Henley', 'LB', 13), P('Tarheeb Still', 'CB', 7.5), P('Derwin James Jr.', 'S', 11.5)] },
    { abbr: 'LV', city: 'Las Vegas', name: 'Raiders', conf: 'AFC West',
      c: { jersey: '#101010', trim: '#A5ACAF', helmet: '#A5ACAF', pants: '#A5ACAF', stripe: '#101010' },
      off: [P('Kirk Cousins', 'QB', 12), P('Ashton Jeanty', 'RB', 17, ['power', 'elusive']), P('Tre Tucker', 'WR', 9.5, ['burner']), P('Jalen Nailor', 'WR', 6.5), P('Brock Bowers', 'TE', 14, ['hands', 'burner'])],
      def: [P('Maxx Crosby', 'EDGE', 13, ['rusher']), P('Kwity Paye', 'EDGE', 7), P('Quay Walker', 'LB', 13), P('Eric Stokes', 'CB', 6.5), P('Jeremy Chinn', 'S', 10, ['tackler'])] },

    // ---------------- NFC EAST ----------------
    { abbr: 'DAL', city: 'Dallas', name: 'Cowboys', conf: 'NFC East',
      c: { jersey: '#F4F4F4', trim: '#003594', helmet: '#869397', pants: '#869397', stripe: '#003594' },
      off: [P('Dak Prescott', 'QB', 21), P('Javonte Williams', 'RB', 15.5, ['power']), P('CeeDee Lamb', 'WR', 16, ['elusive', 'hands']), P('George Pickens', 'WR', 17.5, ['burner']), P('Jake Ferguson', 'TE', 13, ['hands'])],
      def: [P('Quinnen Williams', 'DT', 9, ['power']), P('Kenny Clark', 'DT', 6.5), P('Rashan Gary', 'OLB', 9, ['rusher']), P('DaRon Bland', 'CB', 7.5, ['ballhawk']), P('Malik Hooker', 'S', 8)] },
    { abbr: 'NYG', city: 'New York', name: 'Giants', conf: 'NFC East',
      c: { jersey: '#0B2265', trim: '#A71930', helmet: '#0B2265', pants: '#A5ACAF', stripe: '#A71930' },
      off: [P('Jameis Winston', 'QB', 13, ['cannon']), P('Cam Skattebo', 'RB', 17, ['power']), P('Malik Nabers', 'WR', 18, ['burner', 'elusive']), P('Darnell Mooney', 'WR', 7), P('Isaiah Likely', 'TE', 7, ['burner'])],
      def: [P('Abdul Carter', 'EDGE', 9, ['rusher']), P('Kayvon Thibodeaux', 'EDGE', 7.5), P('Jevon Holland', 'S', 9), P('Deonte Banks', 'CB', 6), P('Greg Newsome II', 'CB', 6.5)] },
    { abbr: 'PHI', city: 'Philadelphia', name: 'Eagles', conf: 'NFC East',
      c: { jersey: '#004C54', trim: '#A5ACAF', helmet: '#004C54', pants: '#F4F4F4', stripe: '#A5ACAF' },
      off: [P('Tanner McKee', 'QB', 13), P('Saquon Barkley', 'RB', 16, ['burner', 'power']), P('DeVonta Smith', 'WR', 13.5, ['hands']), P('Makai Lemon', 'WR', 10, ['elusive'], true), P('Dallas Goedert', 'TE', 13)],
      def: [P('Jalen Carter', 'DT', 9, ['rusher', 'power']), P('Jalyx Hunt', 'EDGE', 7), P('Zack Baun', 'LB', 14.5, ['tackler']), P('Quinyon Mitchell', 'CB', 8.5), P('Cooper DeJean', 'CB', 9, ['ballhawk'])] },
    { abbr: 'WAS', city: 'Washington', name: 'Commanders', conf: 'NFC East',
      c: { jersey: '#5A1414', trim: '#FFB612', helmet: '#5A1414', pants: '#FFB612', stripe: '#FFB612' },
      off: [P('Jayden Daniels', 'QB', 19, ['scrambler']), P('Rachaad White', 'RB', 10), P('Stefon Diggs', 'WR', 13.5, ['hands']), P('Dyami Brown', 'WR', 7, ['burner']), P('Chig Okonkwo', 'TE', 8)],
      def: [P('Daron Payne', 'DT', 7.5, ['power']), P('Javon Kinlaw', 'DE', 6.5), P('Frankie Luvu', 'LB', 12.5, ['rusher']), P('Trey Amos', 'CB', 6.5), P('Mike Sainristil', 'CB', 8)] },

    // ---------------- NFC NORTH ----------------
    { abbr: 'CHI', city: 'Chicago', name: 'Bears', conf: 'NFC North',
      c: { jersey: '#0B162A', trim: '#C83803', helmet: '#0B162A', pants: '#F4F4F4', stripe: '#C83803' },
      off: [P('Caleb Williams', 'QB', 18.5, ['mobile', 'cannon']), P("D'Andre Swift", 'RB', 14.5, ['elusive']), P('Rome Odunze', 'WR', 12.5), P('Luther Burden III', 'WR', 11, ['elusive']), P('Colston Loveland', 'TE', 11)],
      def: [P('Montez Sweat', 'EDGE', 9, ['rusher']), P('Austin Booker', 'EDGE', 6), P('Devin Bush', 'LB', 11.5), P('Jaylon Johnson', 'CB', 8), P('Dillon Thieneman', 'S', 9, ['ballhawk'], true)] },
    { abbr: 'DET', city: 'Detroit', name: 'Lions', conf: 'NFC North',
      c: { jersey: '#0076B6', trim: '#B0B7BC', helmet: '#B0B7BC', pants: '#B0B7BC', stripe: '#0076B6' },
      off: [P('Jared Goff', 'QB', 19.5), P('Jahmyr Gibbs', 'RB', 23, ['burner', 'elusive']), P('Amon-Ra St. Brown', 'WR', 19.5, ['hands']), P('Jameson Williams', 'WR', 13.5, ['burner']), P('Sam LaPorta', 'TE', 12.5)],
      def: [P('Aidan Hutchinson', 'EDGE', 12.5, ['rusher']), P('Derrick Moore', 'EDGE', 6.5, [], true), P('Jack Campbell', 'LB', 15, ['tackler']), P('Terrion Arnold', 'CB', 7), P('Kerby Joseph', 'S', 10, ['ballhawk'])] },
    { abbr: 'GB', city: 'Green Bay', name: 'Packers', conf: 'NFC North',
      c: { jersey: '#203731', trim: '#FFB612', helmet: '#FFB612', pants: '#FFB612', stripe: '#203731' },
      off: [P('Jordan Love', 'QB', 18, ['cannon']), P('Josh Jacobs', 'RB', 17.5, ['power']), P('Christian Watson', 'WR', 13, ['burner']), P('Matthew Golden', 'WR', 8, ['burner']), P('Tucker Kraft', 'TE', 14, ['power'])],
      def: [P('Micah Parsons', 'EDGE', 12.5, ['rusher']), P('Lukas Van Ness', 'EDGE', 6), P('Edgerrin Cooper', 'LB', 13.5), P('Keisean Nixon', 'CB', 7.5), P('Xavier McKinney', 'S', 10.5, ['ballhawk'])] },
    { abbr: 'MIN', city: 'Minnesota', name: 'Vikings', conf: 'NFC North',
      c: { jersey: '#4F2683', trim: '#FFC62F', helmet: '#4F2683', pants: '#F4F4F4', stripe: '#FFC62F' },
      off: [P('Kyler Murray', 'QB', 17, ['scrambler']), P('Jordan Mason', 'RB', 11, ['power']), P('Justin Jefferson', 'WR', 15, ['burner', 'hands']), P('Jordan Addison', 'WR', 11.5, ['elusive']), P('T.J. Hockenson', 'TE', 9.5)],
      def: [P('Andrew Van Ginkel', 'OLB', 9), P('Dallas Turner', 'OLB', 8, ['rusher']), P('Blake Cashman', 'LB', 12.5), P('Byron Murphy Jr.', 'CB', 8.5, ['ballhawk']), P('Harrison Smith', 'S', 8.5)] },

    // ---------------- NFC SOUTH ----------------
    { abbr: 'ATL', city: 'Atlanta', name: 'Falcons', conf: 'NFC South',
      c: { jersey: '#101010', trim: '#A71930', helmet: '#101010', pants: '#F4F4F4', stripe: '#A71930' },
      off: [P('Michael Penix Jr.', 'QB', 14.5, ['cannon']), P('Bijan Robinson', 'RB', 23, ['elusive', 'burner']), P('Drake London', 'WR', 18, ['hands']), P('Jahan Dotson', 'WR', 6), P('Kyle Pitts', 'TE', 12)],
      def: [P('Cameron Thomas', 'EDGE', 6.5), P('Brandon Dorlus', 'DE', 5.5), P('Divine Deablo', 'LB', 11), P('A.J. Terrell', 'CB', 7.5), P('Jessie Bates III', 'S', 10, ['ballhawk'])] },
    { abbr: 'CAR', city: 'Carolina', name: 'Panthers', conf: 'NFC South',
      c: { jersey: '#0085CA', trim: '#101820', helmet: '#A5ACAF', pants: '#A5ACAF', stripe: '#0085CA' },
      off: [P('Bryce Young', 'QB', 15.5, ['mobile']), P('Chuba Hubbard', 'RB', 10), P('Tetairoa McMillan', 'WR', 14.5, ['power', 'hands']), P('Jalen Coker', 'WR', 9), P('Tommy Tremble', 'TE', 5.5)],
      def: [P('Jaelan Phillips', 'OLB', 8.5, ['rusher']), P('Bobby Brown III', 'DE', 5.5, ['power']), P('Devin Lloyd', 'LB', 13.5, ['ballhawk']), P("Tre'von Moehrig", 'S', 9), P('Akayleb Evans', 'CB', 5.5)] },
    { abbr: 'NO', city: 'New Orleans', name: 'Saints', conf: 'NFC South',
      c: { jersey: '#101820', trim: '#D3BC8D', helmet: '#D3BC8D', pants: '#D3BC8D', stripe: '#101820' },
      off: [P('Tyler Shough', 'QB', 15), P('Kendre Miller', 'RB', 8), P('Chris Olave', 'WR', 16, ['burner']), P('Bryce Lance', 'WR', 8, [], true), P('Juwan Johnson', 'TE', 10)],
      def: [P('Chase Young', 'EDGE', 9, ['rusher']), P('Carl Granderson', 'DE', 8), P('Pete Werner', 'LB', 11.5), P('Kool-Aid McKinstry', 'CB', 7), P('Justin Reid', 'S', 9.5)] },
    { abbr: 'TB', city: 'Tampa Bay', name: 'Buccaneers', conf: 'NFC South',
      c: { jersey: '#D50A0A', trim: '#34302B', helmet: '#34302B', pants: '#34302B', stripe: '#D50A0A' },
      off: [P('Baker Mayfield', 'QB', 18.5, ['mobile']), P('Bucky Irving', 'RB', 15, ['elusive']), P('Emeka Egbuka', 'WR', 14, ['hands']), P('Chris Godwin Jr.', 'WR', 10, ['hands']), P('Cade Otton', 'TE', 8)],
      def: [P('Yaya Diaby', 'EDGE', 8.5, ['rusher']), P('Vita Vea', 'DT', 7, ['power']), P('Antoine Winfield Jr.', 'S', 10.5, ['tackler']), P('Zyon McCollum', 'CB', 8), P('Jacob Parrish', 'CB', 7)] },

    // ---------------- NFC WEST ----------------
    { abbr: 'ARI', city: 'Arizona', name: 'Cardinals', conf: 'NFC West',
      c: { jersey: '#97233F', trim: '#F4F4F4', helmet: '#F4F4F4', pants: '#F4F4F4', stripe: '#97233F' },
      off: [P('Jacoby Brissett', 'QB', 17), P('Jeremiyah Love', 'RB', 15, ['burner', 'elusive'], true), P('Michael Wilson', 'WR', 13, ['power']), P('Kendrick Bourne', 'WR', 8), P('Trey McBride', 'TE', 18, ['hands'])],
      def: [P('Josh Sweat', 'EDGE', 9, ['rusher']), P('Walter Nolen III', 'DT', 6, ['power']), P('Budda Baker', 'S', 12, ['tackler']), P('Will Johnson', 'CB', 7), P('Max Melton', 'CB', 6.5)] },
    { abbr: 'LAR', city: 'Los Angeles', name: 'Rams', conf: 'NFC West',
      c: { jersey: '#003594', trim: '#FFD100', helmet: '#003594', pants: '#F4F4F4', stripe: '#FFD100' },
      off: [P('Matthew Stafford', 'QB', 21.5, ['cannon']), P('Kyren Williams', 'RB', 17), P('Puka Nacua', 'WR', 21, ['power', 'hands']), P('Jordan Whittington', 'WR', 5), P('Colby Parkinson', 'TE', 7)],
      def: [P('Byron Young', 'EDGE', 11, ['rusher']), P('Poona Ford', 'DT', 6.5, ['power']), P('Nate Landman', 'LB', 12.5), P('Trent McDuffie', 'CB', 9), P('Kamren Kinchens', 'S', 9.5, ['ballhawk'])] },
    { abbr: 'SF', city: 'San Francisco', name: '49ers', conf: 'NFC West',
      c: { jersey: '#AA0000', trim: '#B3995D', helmet: '#B3995D', pants: '#B3995D', stripe: '#AA0000' },
      off: [P('Brock Purdy', 'QB', 19, ['mobile']), P('Christian McCaffrey', 'RB', 24, ['elusive', 'hands']), P('Mike Evans', 'WR', 11, ['power']), P('Jordan Watkins', 'WR', 5, ['burner']), P('George Kittle', 'TE', 14, ['power'])],
      def: [P('Nick Bosa', 'EDGE', 9.5, ['rusher']), P('Fred Warner', 'LB', 14.5, ['tackler']), P("Ji'Ayir Brown", 'S', 8.5), P('Deommodore Lenoir', 'CB', 8), P('Renardo Green', 'CB', 7.5)] },
    { abbr: 'SEA', city: 'Seattle', name: 'Seahawks', conf: 'NFC West',
      c: { jersey: '#002244', trim: '#69BE28', helmet: '#2E3B4E', pants: '#F4F4F4', stripe: '#69BE28' },
      off: [P('Sam Darnold', 'QB', 17), P('Emanuel Wilson', 'RB', 8, ['power']), P('Jaxon Smith-Njigba', 'WR', 21, ['elusive', 'hands']), P('Cooper Kupp', 'WR', 9, ['hands']), P('AJ Barner', 'TE', 10)],
      def: [P('DeMarcus Lawrence', 'EDGE', 9, ['rusher']), P('Leonard Williams', 'DT', 8.5, ['power']), P('Ernest Jones IV', 'LB', 14), P('Devon Witherspoon', 'CB', 10, ['tackler']), P('Nick Emmanwori', 'S', 9.5)] }
  ];

  // Secret team (unlocked with a code on the title screen). Every name here is
  // fictional; the ratings are built from the same template as everyone else.
  var HIDDEN = { abbr: 'BLZ', city: 'Blitz', name: 'Legends', conf: 'Secret Team', hidden: true,
    c: { jersey: '#111111', trim: '#FFD23A', helmet: '#FFD23A', pants: '#111111', stripe: '#FF4D1F' },
    off: [P('Ace Inferno', 'QB', 25, ['scrambler', 'cannon']), P('Rocket Ramirez', 'RB', 25, ['burner', 'elusive']), P('Neon Nova', 'WR', 22, ['burner', 'hands']), P('Flash Fontaine', 'WR', 21, ['burner']), P('Tank Titan', 'TE', 18, ['power', 'hands'])],
    def: [P('Hammer Hollister', 'EDGE', 14, ['rusher']), P('Boulder Bronson', 'DT', 12, ['power']), P('Blitz Barrow', 'LB', 17, ['tackler']), P('Lockdown Lux', 'CB', 11, ['ballhawk']), P('Ghost Galloway', 'S', 14, ['ballhawk', 'tackler'])] };

  // Expand compact entries into full players using the shared template.
  TEAMS.concat([HIDDEN]).forEach(function (t) {
    t.offense = t.off.map(function (e, i) { return FB.Template.buildPlayer(e, t.abbr, 'O' + i); });
    t.defense = t.def.map(function (e, i) { return FB.Template.buildPlayer(e, t.abbr, 'D' + i); });
    t.ol = [FB.Template.genericPlayer('OL', t.abbr, 'OL0'), FB.Template.genericPlayer('OL', t.abbr, 'OL1')];
    t.depth = [FB.Template.genericPlayer('DL', t.abbr, 'DL9'), FB.Template.genericPlayer('DB', t.abbr, 'DB9')];
    var o = t.offense, d = t.defense;
    t.ratings = {
      pass: Math.round((o[0].r.ovr * 2 + o[2].r.ovr + o[3].r.ovr + o[4].r.ovr) / 5),
      rush: Math.round((o[1].r.ovr * 2 + o[0].r.spd * 0.5 + o[4].r.str * 0.5) / 3),
      def: Math.round(d.reduce(function (s, p) { return s + p.r.ovr; }, 0) / d.length)
    };
    t.ratings.ovr = Math.round((t.ratings.pass + t.ratings.rush + t.ratings.def * 2) / 4);
  });

  FB.TEAMS = TEAMS;
  FB.HIDDEN_TEAM = HIDDEN;
  FB.ROSTER_DATE = 'Week 8 depth charts, late October 2026';
})();
