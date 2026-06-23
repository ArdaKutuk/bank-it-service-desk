from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="user")
    department = Column(String, nullable=True)


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_no = Column(String, unique=True, index=True, nullable=False)

    full_name = Column(String, nullable=False)
    department = Column(String, nullable=False)
    issue_type = Column(String, nullable=False)
    description = Column(Text, nullable=False)

    status = Column(String, default="Açık")
    priority = Column(String, default="Normal")

    assigned_department = Column(String, nullable=True)
    assigned_to = Column(String, nullable=True)

    created_by = Column(String, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sla_hours = Column(Integer, default=24)


class ITRequest(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, index=True)
    request_no = Column(String, unique=True, index=True, nullable=False)

    full_name = Column(String, nullable=False)
    department = Column(String, nullable=False)
    request_type = Column(String, nullable=False)
    description = Column(Text, nullable=False)

    approval_status = Column(String, default="Onay Bekliyor")

    assigned_department = Column(String, nullable=True)
    assigned_to = Column(String, nullable=True)

    created_by = Column(String, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    item_type = Column(String, nullable=False, index=True)
    item_id = Column(Integer, nullable=False, index=True)

    sender_name = Column(String, nullable=False)
    sender_role = Column(String, nullable=False)
    body = Column(Text, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id = Column(Integer, primary_key=True, index=True)
    item_type = Column(String, nullable=False, index=True)
    item_id = Column(Integer, nullable=False, index=True)
    event_type = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AIAgentReport(Base):
    __tablename__ = "ai_agent_reports"

    id = Column(Integer, primary_key=True, index=True)
    item_type = Column(String, nullable=False, index=True)
    item_id = Column(Integer, nullable=False, index=True)
    item_no = Column(String, nullable=False, index=True)
    selected_issue_type = Column(String, nullable=True)
    original_department = Column(String, nullable=True)
    suggested_department = Column(String, nullable=False)
    action = Column(String, nullable=False)
    reason = Column(Text, nullable=False)
    confidence = Column(Integer, default=0)
    data_scope = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class KnowledgeArticle(Base):
    __tablename__ = "knowledge_articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False, index=True)
    keywords = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    solution_steps = Column(Text, nullable=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_username = Column(String, nullable=False, index=True)
    actor_name = Column(String, nullable=False)
    actor_role = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False, index=True)
    item_type = Column(String, nullable=True, index=True)
    item_id = Column(Integer, nullable=True)
    item_no = Column(String, nullable=True)
    details = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
