import { CircleCheck, Circle, CircleAlert } from "lucide-react";

export function CandidateJourney({status,eligibility,screening,orientation,policies,interviewRequired,interviewCompleted,offerIssued,offerAccepted,offerExpired,enrollment,programme}:{status:string;eligibility:string;screening:string;orientation:boolean|null;policies:boolean|null;interviewRequired:boolean|null;interviewCompleted:boolean;offerIssued:boolean;offerAccepted:boolean;offerExpired:boolean;enrollment:string|null;programme:{durationDays:number;dayMode:string;timezone:string;jobVersion:number}|null}){
  const closed=["REJECTED","WITHDRAWN","CLOSED","OFFER_DECLINED"].includes(status);
  const steps=[
    {name:"Application",state:status==="DRAFT"?"Pending":"Recorded"},
    {name:"Human screening",state:eligibility==="ELIGIBLE" && screening==="PASSED" ?"Recorded":"Pending"},
    {name:"Interview",state:interviewRequired===null?"Not configured":interviewRequired===false?"Not required by role policy":interviewCompleted?"Recorded":"Pending"},
    {name:"Role orientation",state:orientation===null?"Not configured":orientation?"Recorded":"Pending"},
    {name:"Policy acknowledgement",state:policies===null?"Not configured":policies?"Recorded":"Pending"},
    {name:"Management-reviewed offer",state:offerAccepted?"Accepted":offerExpired?"Expired / Contact your manager":offerIssued?"Issued / Review and respond":"Pending"},
    {name:"Training enrollment",state:enrollment?enrollment==="CANCELLED"?"Cancelled":"Enrolled":offerAccepted?"Your confirmation required":"Pending"}
  ];
  return <section className="nj-candidate-journey" aria-labelledby="journey-heading"><h2 id="journey-heading">Your application journey</h2>{closed&&<p>This application is {status.toLowerCase().replaceAll("_"," ")}. No further hiring step is implied.</p>}
    <ol>{steps.map(s=><li key={s.name}>{["Recorded","Accepted","Enrolled"].includes(s.state)?<CircleCheck size={18} aria-hidden="true"/>:s.state==="Not configured"||s.state==="Cancelled"?<CircleAlert size={18} aria-hidden="true"/>:<Circle size={18} aria-hidden="true"/>}<strong>{s.name}</strong><span>{s.state}</span></li>)}</ol>
    {programme&&<p>Offered training: {programme.durationDays} {programme.dayMode==="WORKING"?"working":"calendar"} days / {programme.timezone} / Job version {programme.jobVersion}. Enrollment is separate from accepting your offer; neither activates employment.</p>}
  </section>;
}
